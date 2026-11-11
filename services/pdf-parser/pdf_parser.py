#!/usr/bin/env python3
"""
PDF 中英对照解析器（PyMuPDF）
用法:
  python3 pdf_parser.py <input.pdf> [--out out.json] [--min-header-repeat 0.5]

输出 JSON:
{
  "file": {"name", "sizeBytes", "sha256", "pages"},
  "meta": {...统计与算法信息...},
  "needsOcr": [{"page": n, "reason": "..."}],   # 疑似扫描页（不自动 OCR）
  "paragraphs": [
    {"order", "type": PARAGRAPH|HEADING, "textEn", "textZh",
     "pageStart", "pageEnd", "confidence", "warnings": [...]}
  ]
}

算法概述:
1. 用 fitz 逐页提取文本块（保留阅读顺序、bbox、页码），不默认 OCR；
   若某页文本字符数过低但存在大图，标记 needsOcr。
2. 归一化后统计跨页重复出现的顶部/底部行 → 页眉/页脚/公众号水印过滤。
3. 按阅读顺序合并相邻同语言块为段落；识别标题（短行 + 字体更大或全大写/以#开头）。
4. 中英配对：顺序滑动 —— 英文段落组后跟的中文段落组互相配对；
   以长度比例与相邻关系计算置信度；未配对的段落保留为单语段落（不丢弃）。
"""
import argparse
import hashlib
import json
import os
import re
import sys
import unicodedata
import time

CJK_RE = re.compile(r"[\u4e00-\u9fff\u3400-\u4dbf]")
# 页眉页脚典型噪音：公众号名、日期、页码、"第x页"
NOISE_PATTERNS = [
    re.compile(r"制作BY", re.IGNORECASE),
    re.compile(r"^制作[:：]"),
    re.compile(r"公众号[：:]?\s*\S{1,20}$"),
    re.compile(r"^第\s*\d+\s*页"),
    re.compile(r"^\d+\s*/\s*\d+$"),
    re.compile(r"^\d+$"),
    re.compile(r"^[-–—=]{3,}$"),
    re.compile(r"关注|公众号|微信|扫描.*二维码|订阅号", re.IGNORECASE),
    re.compile(r"^Page\s*\d+", re.IGNORECASE),
    re.compile(r"www\.\w+\.(com|cn|net|org)", re.IGNORECASE),
]

def cjk_ratio(text: str) -> float:
    total = 0
    cjk = 0
    for ch in text:
        if ch.isspace():
            continue
        total += 1
        if CJK_RE.match(ch):
            cjk += 1
    return cjk / total if total else 0.0

def is_chinese_block(text: str) -> bool:
    return cjk_ratio(text) > 0.3

def normalize_line(text: str) -> str:
    text = unicodedata.normalize("NFKC", text)
    text = re.sub(r"\s+", "", text)
    text = text.replace("，", ",").replace("。", ".").replace("：", ":").replace("；", ";").replace("（", "(").replace("）", ")")
    return text.lower().strip()

def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 16), b""):
            h.update(chunk)
    return h.hexdigest()

def detect_noise_lines(pages_lines, min_repeat):
    """跨页重复出现且位于页面顶部/底部的行 → 噪音"""
    if not pages_lines:
        return set()
    from collections import Counter

    counter = Counter()
    total_pages = len(pages_lines)
    for lines in pages_lines:
        zone = {normalize_line(t) for t, _ in lines}
        for key in zone:
            if key:
                counter[key] += 1
    threshold = max(2, int(total_pages * min_repeat))
    noisy = set()
    for key, cnt in counter.items():
        if cnt >= threshold and len(key) <= 60:
            noisy.add(key)
    # 额外：任何页命中典型噪音 pattern 的行
    for lines in pages_lines:
        for text, _ in lines:
            for pat in NOISE_PATTERNS:
                if pat.search(text.strip()):
                    noisy.add(normalize_line(text))
    return noisy

def extract_blocks(doc):
    """提取所有文本块：[(page_no, order, bbox, text, fontsize)]"""
    blocks = []
    needs_ocr = []
    for pno in range(doc.page_count):
        page = doc[pno]
        raw = page.get_text("dict")
        page_text_len = 0
        max_img_area = 0
        for img in page.get_images(full=True):
            try:
                xref = img[0]
                bbox = page.get_image_bbox(img)
                area = abs(bbox.width * bbox.height)
                max_img_area = max(max_img_area, area)
            except Exception:
                continue
        order = 0
        for block in raw.get("blocks", []):
            if block.get("type") != 0:  # 只处理文本块
                continue
            texts = []
            sizes = []
            for line in block.get("lines", []):
                line_text = "".join(span.get("text", "") for span in line.get("spans", []))
                for span in line.get("spans", []):
                    sizes.append(span.get("size", 12))
                if line_text.strip():
                    texts.append(line_text.strip())
                    page_text_len += len(line_text.strip())
            text = "\n".join(texts).strip()
            if not text:
                continue
            size = max(sizes) if sizes else 12
            blocks.append(
                {"page": pno + 1, "order": order, "bbox": [round(v, 1) for v in block["bbox"]], "text": text, "size": round(size, 1)}
            )
            order += 1
        if page_text_len < 30 and max_img_area > page.rect.width * page.rect.height * 0.3:
            needs_ocr.append({"page": pno + 1, "reason": f"文本字符过少({page_text_len}) 且存在大图({int(max_img_area)}px^2)，疑似扫描页"})
    return blocks, needs_ocr

def is_noise_line(line: str, noisy_set) -> bool:
    stripped = line.strip()
    if not stripped:
        return True
    if normalize_line(stripped) in noisy_set:
        return True
    # 典型噪音 pattern（公众号水印等可能出现在页面任意位置），仅对短行生效避免误伤正文
    if len(stripped) <= 40:
        for pat in NOISE_PATTERNS:
            if pat.search(stripped):
                return True
    return False

def group_paragraphs(blocks, noisy_lines, body_size):
    """块 → 段落（同语言、相邻、可跨页合并）"""
    paragraphs = []
    cur = None

    def new_para():
        return {
            "type": "PARAGRAPH",
            "lang": None,
            "textEn": [],
            "textZh": [],
            "pageStart": None,
            "pageEnd": None,
            "confidence": 1.0,
            "warnings": [],
        }

    for b in blocks:
        lines = [l for l in b["text"].split("\n") if l.strip()]
        kept_lines = []
        for l in lines:
            if is_noise_line(l, noisy_lines):
                continue
            kept_lines.append(l.strip())
        if not kept_lines:
            continue
        text = "\n".join(kept_lines)

        # 标题判定：短 + 字体大
        is_heading = False
        flat = text.replace("\n", " ")
        if len(flat) <= 60 and b["size"] >= body_size + 1.5:
            is_heading = True
        lang = "zh" if is_chinese_block(flat) else "en"

        if cur is None:
            cur = new_para()
            cur["lang"] = lang
            cur["pageStart"] = b["page"]

        # 语言切换 → 断段
        if lang != cur["lang"]:
            paragraphs.append(cur)
            cur = new_para()
            cur["lang"] = lang
            cur["pageStart"] = b["page"]
            cur["pageEnd"] = b["page"]
            cur["pageStart"] = b["page"]
        # 标题行单独成段
        if is_heading:
            if cur["textEn"] or cur["textZh"]:
                paragraphs.append(cur)
                prev = cur
                cur = new_para()
                cur["lang"] = lang
                cur["pageStart"] = b["page"]
            if lang == "zh":
                cur["textZh"].append(flat)
            else:
                cur["textEn"].append(flat)
            cur["type"] = "HEADING"
            cur["pageEnd"] = b["page"]
            paragraphs.append(cur)
            cur = None
            continue

        if lang == "zh":
            cur["textZh"].append(flat)
        else:
            cur["textEn"].append(flat)
        cur["pageEnd"] = b["page"]

        # 英文段落结束判定：以句末标点结尾的段落即视为完整段
        flat_now = " ".join(cur["textEn"])
        if lang == "en" and re.search(r'[.!?"]\s*$', flat_now):
            paragraphs.append(cur)
            cur = None

    if cur is not None:
        paragraphs.append(cur)
    return paragraphs

def pair_paragraphs(paragraphs):
    """中英配对：EN 段组 + 紧随其后的 ZH 段组。"""
    out = []
    i = 0
    n = len(paragraphs)
    while i < n:
        p = paragraphs[i]
        if p["lang"] == "en":
            # 收集连续英文段
            en_group = [p]
            j = i + 1
            while j < n and paragraphs[j]["lang"] == "en":
                en_group.append(paragraphs[j])
                j += 1
            # 收集紧随的中文段
            zh_group = []
            k = j
            while k < n and paragraphs[k]["lang"] == "zh":
                zh_group.append(paragraphs[k])
                k += 1

            if zh_group:
                en_text = "\n".join(x["textEn"] and " ".join(x["textEn"]) or "" for x in en_group).strip()
                zh_text = "\n".join(" ".join(x["textZh"]) for x in zh_group).strip()
                conf = 0.85
                warnings = []
                # 长度启发：中文字符数 ≈ 英文单词数 * 1.2~2.5 为高置信
                en_words = len(en_text.split())
                zh_chars = len(zh_text)
                if en_words > 0 and zh_chars > 0:
                    ratio = zh_chars / en_words
                    if ratio < 0.5 or ratio > 4.0:
                        conf = 0.45
                        warnings.append("length_ratio_abnormal")
                else:
                    conf = 0.4
                    warnings.append("empty_side")
                if len(en_group) > 3 and len(zh_group) == 1:
                    conf = min(conf, 0.5)
                    warnings.append("many_en_one_zh")
                merged_type = "HEADING" if en_group[0]["type"] == "HEADING" else "PARAGRAPH"
                out.append(
                    {
                        "type": merged_type,
                        "textEn": en_text or None,
                        "textZh": zh_text or None,
                        "pageStart": en_group[0]["pageStart"],
                        "pageEnd": max(x["pageEnd"] or 0 for x in en_group + zh_group),
                        "confidence": conf,
                        "warnings": warnings,
                    }
                )
                i = k
            else:
                # 英文无中文对应
                for x in en_group:
                    out.append(
                        {
                            "type": x["type"],
                            "textEn": " ".join(x["textEn"]) or None,
                            "textZh": " ".join(x["textZh"]) or None,
                            "pageStart": x["pageStart"],
                            "pageEnd": x["pageEnd"],
                            "confidence": 0.5 if x["type"] == "PARAGRAPH" else 0.9,
                            "warnings": ["missing_translation"],
                        }
                    )
                i = j
        elif p["lang"] == "zh":
            # 中文在前（少见）：保留单语
            out.append(
                {
                    "type": p["type"],
                    "textEn": None,
                    "textZh": " ".join(p["textZh"]) or None,
                    "pageStart": p["pageStart"],
                    "pageEnd": p["pageEnd"],
                    "confidence": 0.4,
                    "warnings": ["zh_without_en"],
                }
            )
            i += 1
        else:
            i += 1
    return out

def parse_one(input_path: str, min_header_repeat: float = 0.5) -> dict:
    """解析单个 PDF，返回结果 dict（不写文件）。"""
    import fitz  # PyMuPDF
    from collections import Counter, defaultdict

    doc = fitz.open(input_path)
    blocks, needs_ocr = extract_blocks(doc)

    size_counter = Counter(b["size"] for b in blocks)
    body_size = size_counter.most_common(1)[0][0] if size_counter else 12

    page_heights = {pno + 1: doc[pno].rect.height for pno in range(doc.page_count)}
    page_zone_lines = defaultdict(list)
    for b in blocks:
        top = b["bbox"][1]
        bottom = b["bbox"][3]
        h = page_heights.get(b["page"], 800)
        if top < h * 0.12 or bottom > h * 0.88:
            for l in b["text"].split("\n"):
                if l.strip():
                    page_zone_lines[b["page"]].append((l.strip(), b["page"]))
    pages_lines = [page_zone_lines[pg] for pg in sorted(page_zone_lines.keys())]
    noisy = detect_noise_lines(pages_lines, min_header_repeat)
    noisy_count = len(noisy)

    paragraphs_raw = group_paragraphs(blocks, noisy, body_size)
    paired = pair_paragraphs(paragraphs_raw)

    result_paragraphs = []
    for i, p in enumerate(paired):
        text_en = (p.get("textEn") or "").strip() or None
        text_zh = (p.get("textZh") or "").strip() or None
        result_paragraphs.append(
            {
                "order": i,
                "type": p["type"],
                "textEn": text_en,
                "textZh": text_zh,
                "pageStart": p["pageStart"],
                "pageEnd": p["pageEnd"],
                "confidence": round(p["confidence"], 2),
                "warnings": p["warnings"],
            }
        )

    n_en = sum(1 for p in result_paragraphs if p["textEn"])
    n_zh = sum(1 for p in result_paragraphs if p["textZh"])
    n_both = sum(1 for p in result_paragraphs if p["textEn"] and p["textZh"])
    low_conf = sum(1 for p in result_paragraphs if p["confidence"] < 0.5)

    result = {
        "file": {
            "name": os.path.basename(input_path),
            "sizeBytes": os.path.getsize(input_path),
            "sha256": sha256_file(input_path),
            "pages": doc.page_count,
        },
        "meta": {
            "parser": "pymupdf",
            "bodySize": body_size,
            "noiseLinesRemoved": noisy_count,
            "minHeaderRepeat": min_header_repeat,
            "stats": {
                "paragraphs": len(result_paragraphs),
                "withEnglish": n_en,
                "withChinese": n_zh,
                "withBoth": n_both,
                "lowConfidence": low_conf,
            },
        },
        "needsOcr": needs_ocr,
        "paragraphs": result_paragraphs,
    }
    doc.close()
    return result


def main():
    ap = argparse.ArgumentParser(description="PDF bilingual parser")
    ap.add_argument("input", nargs="*", help="PDF 文件路径（可多个）")
    ap.add_argument("--out", default=None, help="输出 JSON 路径（单文件）或 JSONL 路径（批量）")
    ap.add_argument("--min-header-repeat", type=float, default=0.5, help="页眉/页脚重复阈值(占页数比例)")
    ap.add_argument("--batch", action="store_true", help="批量模式：多文件输出 JSONL")
    args = ap.parse_args()

    try:
        import pymupdf  # noqa: F401  提前校验依赖
    except ImportError:
        try:
            import fitz  # noqa: F401
        except ImportError:
            print("ERROR: PyMuPDF not installed. Run: pip install pymupdf", file=sys.stderr)
            sys.exit(3)

    if not args.input:
        print("ERROR: no input files", file=sys.stderr)
        sys.exit(2)

    # 批量模式：多文件 → JSONL（单进程，消除 N 次 Python/PyMuPDF 启动开销）
    if len(args.input) > 1 or (args.out or "").endswith(".jsonl"):
        out = args.out or (args.input[0] + ".batch.jsonl")
        t0 = time.time()
        with open(out, "w", encoding="utf-8") as f:
            for idx, path in enumerate(args.input, 1):
                try:
                    result = parse_one(path, args.min_header_repeat)
                    f.write(json.dumps({"ok": True, "input": path, "result": result}, ensure_ascii=False) + "\n")
                    st = result["meta"]["stats"]
                    print(f"[{idx}/{len(args.input)}] {os.path.basename(path)} paras={st['paragraphs']} both={st['withBoth']}", flush=True)
                except Exception as e:  # 单文件失败不拖垮整批
                    f.write(json.dumps({"ok": False, "input": path, "error": str(e)}, ensure_ascii=False) + "\n")
                    print(f"[{idx}/{len(args.input)}] {os.path.basename(path)} FAILED: {e}", file=sys.stderr, flush=True)
        print(f"BATCH OK files={len(args.input)} seconds={round(time.time() - t0, 2)}")
        return

    # 单文件模式（保持向后兼容）
    result = parse_one(args.input[0], args.min_header_repeat)
    out = args.out or (args.input[0] + ".parsed.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=1)
    st = result["meta"]["stats"]
    print(f"OK pages={result['file']['pages']} paragraphs={st['paragraphs']} both={st['withBoth']} lowConf={st['lowConfidence']} needsOcr={len(result['needsOcr'])}")


if __name__ == "__main__":
    main()

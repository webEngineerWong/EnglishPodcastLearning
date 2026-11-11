#!/usr/bin/env bash
# 创建 Python venv 并安装 PDF 解析依赖
set -e
cd "$(dirname "$0")"
if [ ! -d .venv ]; then
  python3 -m venv .venv
  echo "venv created"
fi
./.venv/bin/pip install --quiet --upgrade pip
./.venv/bin/pip install --quiet -r requirements.txt
./.venv/bin/python -c "import fitz; print('PyMuPDF', fitz.version, 'OK')"

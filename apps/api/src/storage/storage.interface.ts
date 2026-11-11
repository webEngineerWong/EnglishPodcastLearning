/** 统一存储接口 —— local / R2 双实现，业务代码只依赖此接口 */
export interface StoredObject {
  key: string;
  url: string;
  sizeBytes: number;
  mimeType: string;
}

export interface StorageService {
  /** 上传文件；key 由调用方生成（建议含日期与随机后缀） */
  upload(buffer: Buffer, key: string, mimeType: string): Promise<StoredObject>;
  /** 删除文件（本地/R2 一致语义；对象不存在不抛错） */
  delete(key: string): Promise<void>;
  /** 私有对象的限时访问地址：local 返回直链；R2 返回签名 URL */
  getSignedUrl(key: string, ttlSec?: number): Promise<string>;
  /** 流式读取（local 支持 HTTP Range 的场景由 StorageController 处理） */
  getStream(key: string, range?: { start: number; end: number }): Promise<NodeJS.ReadableStream>;
  /** 元数据 */
  getMetadata(key: string): Promise<{ sizeBytes: number; mimeType: string; lastModified: Date } | null>;
}

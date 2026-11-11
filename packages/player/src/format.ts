/** 时间格式化（独立文件，避免 UI 与引擎循环依赖） */
export function formatTime(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0:00';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? h + ':' : ''}${mm}:${String(s).padStart(2, '0')}`;
}

/** 学习时长格式化：中文环境输出 "25 分钟"；超 1h 输出小时 */
export function formatDuration(ms: number, unitMin = '分钟', unitHour = '小时'): string {
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min} ${unitMin}`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} ${unitHour}` : `${h} ${unitHour} ${m} ${unitMin}`;
}

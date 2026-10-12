type LogLevel = "info" | "warn" | "error";

type SafeLog = {
  event: string;
  requestId?: string;
  organizationId?: string;
  actorId?: string;
  code?: string;
};

export function logSafe(level: LogLevel, entry: SafeLog) {
  const record = {
    level,
    timestamp: new Date().toISOString(),
    ...entry,
  };

  const output = JSON.stringify(record);
  if (level === "error") console.error(output);
  else if (level === "warn") console.warn(output);
  else console.info(output);
}

import { z } from "zod";

export const cardFieldSchema = z.object({
  rawValue: z.string().nullable(),
  normalizedValue: z.string().nullable(),
  state: z.enum(["extracted", "missing", "uncertain"]),
});

export const recognizedCardSchema = z.object({
  schemaVersion: z.literal(1),
  detectedLanguage: z.enum(["vi", "en", "ko", "ja", "zh", "unknown"]),
  fields: z.object({
    fullName: cardFieldSchema,
    jobTitle: cardFieldSchema,
    companyName: cardFieldSchema,
    email: cardFieldSchema,
    phone: cardFieldSchema,
    address: cardFieldSchema,
    website: cardFieldSchema,
  }),
});

export type RecognizedCard = z.infer<typeof recognizedCardSchema>;

export interface CardRecognitionProvider {
  readonly name: string;
  recognize(input: { image: Uint8Array; mediaType: string }): Promise<RecognizedCard>;
}

export function isCardRecognitionEnabled() {
  return process.env.CARD_RECOGNITION_ENABLED === "true";
}

import { z } from "zod";

export const REQUEST_STATUSES = ["SUBMITTED", "IN_PROGRESS", "READY", "ISSUED", "REJECTED"] as const;

export const createRequestSchema = z.object({
  typeId: z.string().min(1, "Выберите тип справки").max(64),
  destination: z
    .string()
    .trim()
    .min(2, "Укажите, куда нужна справка")
    .max(200, "Не больше 200 символов"),
  copies: z.coerce.number().int().min(1, "Минимум 1 экземпляр").max(5, "Не больше 5 экземпляров"),
  comment: z.string().trim().max(500, "Не больше 500 символов").optional().default(""),
});

export type CreateRequestInput = z.infer<typeof createRequestSchema>;

export const updateRequestStatusSchema = z.object({
  requestId: z.string().min(1).max(64),
  status: z.enum(REQUEST_STATUSES),
  comment: z.string().trim().max(500).optional().default(""),
});

export type UpdateRequestStatusInput = z.infer<typeof updateRequestStatusSchema>;

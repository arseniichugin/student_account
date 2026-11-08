import { z } from "zod";

export const loginSchema = z.object({
  login: z.string().trim().toLowerCase().min(1, "Введите логин").max(64),
  password: z.string().min(1, "Введите пароль").max(256),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Введите текущий пароль").max(256),
    newPassword: z
      .string()
      .min(10, "Новый пароль — не короче 10 символов")
      .max(256, "Слишком длинный пароль"),
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Пароли не совпадают",
  });

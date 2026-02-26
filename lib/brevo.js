"use server";

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const BREVO_SMTP_USER = process.env.BREVO_SMTP_USER;
const BREVO_SMTP_PASSWORD = process.env.BREVO_SMTP_PASSWORD;
const BREVO_SMTP_HOST = process.env.BREVO_SMTP_HOST;
const BREVO_SMTP_PORT = process.env.BREVO_SMTP_PORT;
const BREVO_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL;
const BREVO_SENDER_NAME = process.env.BREVO_SENDER_NAME || "Englishmate Aula Virtual";
const BREVO_TEMPLATE_RECOVERY_ID = Number(process.env.BREVO_TEMPLATE_RECOVERY_ID || "334");
const BREVO_TEMPLATE_ENROLLMENT_ID = Number(process.env.BREVO_TEMPLATE_ENROLLMENT_ID || "335");
const BREVO_TEMPLATE_PRE_ENROLL_OTP_ID = Number(process.env.BREVO_TEMPLATE_PRE_ENROLL_OTP_ID || "336");

function ensureBrevoConfig() {
  if (
    !BREVO_API_KEY ||
    !BREVO_SENDER_EMAIL ||
    !BREVO_SMTP_USER ||
    !BREVO_SMTP_PASSWORD ||
    !BREVO_SMTP_HOST ||
    !BREVO_SMTP_PORT
  ) {
    throw new Error("Configura las variables de Brevo para enviar el correo de recuperacion.");
  }
}

function resolveStudentName(name, toEmail) {
  const candidate = String(name || "").trim() || String(toEmail || "").trim();
  return candidate || "Alumno";
}

function buildStudentNameParams(name, toEmail) {
  const studentName = resolveStudentName(name, toEmail);
  return {
    name: studentName,
  };
}

export async function sendBrevoTemplateEmail({ toEmail, toName, templateId, params = {} }) {
  ensureBrevoConfig();

  const safeEmail = String(toEmail || "").trim().toLowerCase();
  if (!safeEmail) {
    throw new Error("El correo destino es obligatorio para enviar email con Brevo.");
  }

  const safeTemplateId = Number(templateId || 0);
  if (!Number.isInteger(safeTemplateId) || safeTemplateId <= 0) {
    throw new Error("TemplateId invalido para enviar email con Brevo.");
  }

  const payload = {
    sender: {
      email: BREVO_SENDER_EMAIL,
      name: BREVO_SENDER_NAME,
    },
    to: [
      {
        email: safeEmail,
        name: resolveStudentName(toName, safeEmail),
      },
    ],
    templateId: safeTemplateId,
    params: params && typeof params === "object" ? params : {},
  };

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": BREVO_API_KEY,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const info = await response.text();
    throw new Error(`No se pudo enviar el correo con plantilla ${safeTemplateId}: ${info}`);
  }
}

export async function sendRecoveryEmail({ toEmail, name, code }) {
  try {
    await sendBrevoTemplateEmail({
      toEmail,
      toName: name,
      templateId: BREVO_TEMPLATE_RECOVERY_ID,
      params: {
        ...buildStudentNameParams(name, toEmail),
        code,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "");
    throw new Error(`No se pudo enviar el correo de recuperacion: ${message}`);
  }
}

export async function sendEnrollmentEmail({ toEmail, name, course, schedule, studentCode, tempPassword }) {
  if (!BREVO_TEMPLATE_ENROLLMENT_ID) {
    throw new Error("Configura BREVO_TEMPLATE_ENROLLMENT_ID para enviar el correo de inscripcion.");
  }

  try {
    await sendBrevoTemplateEmail({
      toEmail,
      toName: name,
      templateId: BREVO_TEMPLATE_ENROLLMENT_ID,
      params: {
        ...buildStudentNameParams(name, toEmail),
        course: course || "Curso asignado",
        schedule: schedule || "Sin horario",
        student_code: studentCode || "",
        temp_password: tempPassword || "",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "");
    throw new Error(`No se pudo enviar el correo de inscripcion: ${message}`);
  }
}

export async function sendPreEnrollmentOtpEmail({
  toEmail,
  name,
  code,
  expiresMinutes,
  otpCode,
  studentCode,
  loginUrl,
}) {
  if (!BREVO_TEMPLATE_PRE_ENROLL_OTP_ID) {
    throw new Error("Configura BREVO_TEMPLATE_PRE_ENROLL_OTP_ID para enviar el correo de pre-matricula.");
  }

  try {
    await sendBrevoTemplateEmail({
      toEmail,
      toName: name,
      templateId: BREVO_TEMPLATE_PRE_ENROLL_OTP_ID,
      params: {
        ...buildStudentNameParams(name, toEmail),
        code,
        otp_code: otpCode || "",
        expires_minutes: expiresMinutes,
        student_code: studentCode || "",
        login_url: loginUrl || "",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "");
    throw new Error(`No se pudo enviar el correo de pre-matricula: ${message}`);
  }
}

"use server";

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const BREVO_SMTP_USER = process.env.BREVO_SMTP_USER;
const BREVO_SMTP_PASSWORD = process.env.BREVO_SMTP_PASSWORD;
const BREVO_SMTP_HOST = process.env.BREVO_SMTP_HOST;
const BREVO_SMTP_PORT = process.env.BREVO_SMTP_PORT;
const BREVO_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL;
const BREVO_SENDER_NAME = process.env.BREVO_SENDER_NAME || "Englishmate Aula Virtual";
const BREVO_TEMPLATE_RECOVERY_ID = Number(process.env.BREVO_TEMPLATE_RECOVERY_ID || "334");
const BREVO_TEMPLATE_WELCOME_ID = Number(process.env.BREVO_TEMPLATE_WELCOME_ID || "0");
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

export async function sendRecoveryEmail({ toEmail, name, code }) {
  ensureBrevoConfig();

  const payload = {
    sender: {
      email: BREVO_SENDER_EMAIL,
      name: BREVO_SENDER_NAME,
    },
    to: [
      {
        email: toEmail,
        name: name || toEmail,
      },
    ],
    templateId: BREVO_TEMPLATE_RECOVERY_ID,
    params: {
      name: name || "Alumno",
      code,
    },
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
    throw new Error(`No se pudo enviar el correo de recuperacion: ${info}`);
  }
}

export async function sendEnrollmentEmail({ toEmail, name, course, schedule, studentCode, tempPassword }) {
  ensureBrevoConfig();
  if (!BREVO_TEMPLATE_ENROLLMENT_ID) {
    throw new Error("Configura BREVO_TEMPLATE_ENROLLMENT_ID para enviar el correo de inscripcion.");
  }

  const payload = {
    sender: {
      email: BREVO_SENDER_EMAIL,
      name: BREVO_SENDER_NAME,
    },
    to: [
      {
        email: toEmail,
        name: name || toEmail,
      },
    ],
    templateId: BREVO_TEMPLATE_ENROLLMENT_ID,
    params: {
      name: name || "Alumno",
      course: course || "Curso asignado",
      schedule: schedule || "Sin horario",
      student_code: studentCode || "",
      temp_password: tempPassword || "",
    },
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
    throw new Error(`No se pudo enviar el correo de inscripcion: ${info}`);
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
  ensureBrevoConfig();
  if (!BREVO_TEMPLATE_PRE_ENROLL_OTP_ID) {
    throw new Error("Configura BREVO_TEMPLATE_PRE_ENROLL_OTP_ID para enviar el correo de pre-matricula.");
  }

  const payload = {
    sender: {
      email: BREVO_SENDER_EMAIL,
      name: BREVO_SENDER_NAME,
    },
    to: [
      {
        email: toEmail,
        name: name || toEmail,
      },
    ],
    templateId: BREVO_TEMPLATE_PRE_ENROLL_OTP_ID,
    params: {
      name: name || "Alumno",
      code,
      otp_code: otpCode || "",
      expires_minutes: expiresMinutes,
      student_code: studentCode || "",
      login_url: loginUrl || "",
    },
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
    throw new Error(`No se pudo enviar el correo de pre-matricula: ${info}`);
  }
}

interface Email {
  to: string;
  subject: string;
  text: string;
  html: string;
  headers?: Record<string, string>;
}

/** Sends through Resend when configured; otherwise, in dev only, prints to the server log. */
export async function sendEmail(email: Email): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  // A sign-in link in a production log would let anyone who can read the logs sign in as that person.
  if (!apiKey && process.env.NODE_ENV === "production") throw new Error("RESEND_API_KEY is not set; can't send email");
  if (!apiKey) {
    console.log(`\n[email] To: ${email.to}\n[email] Subject: ${email.subject}\n[email] ${email.text}\n`);
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: email.to,
      subject: email.subject,
      text: email.text,
      html: email.html,
      headers: email.headers,
    }),
  });
  if (!res.ok) throw new Error(`Resend error ${res.status}: ${await res.text()}`);
}

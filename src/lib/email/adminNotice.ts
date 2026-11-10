const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export type NewAccountRequest = { name: string; email: string; role: 'shooter' | 'coach'; link: string };

/**
 * Tells the admin about a new account request, with a link that opens the approval page without a sign-in.
 * Returns false (never throws) when mail is not configured or fails: the request is still in the admin list.
 */
export async function notifyAdminOfRequest(r: NewAccountRequest): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.ADMIN_EMAIL;
  if (!key || !to) return false;
  const role = r.role === 'coach' ? 'trenera' : 'strelca';
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || 'Shooting Analyzer <onboarding@resend.dev>',
        to,
        subject: `Novi zahtev za nalog ${role}: ${r.name}`,
        text: `${r.name} (${r.email}) traži nalog ${role}.\n\nPregled i odobrenje: ${r.link}\n`,
        html: `<p><strong>${esc(r.name)}</strong> (${esc(r.email)}) traži nalog ${role}.</p><p><a href="${esc(r.link)}">Pregledaj i odobri</a></p>`,
      }),
    });
    if (!res.ok) console.error('admin notice failed', res.status);
    return res.ok;
  } catch (e) {
    console.error('admin notice failed', e instanceof Error ? e.message : e);
    return false;
  }
}

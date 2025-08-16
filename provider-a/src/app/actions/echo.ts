'use server';

export async function echo(body: any) {
  return { youSent: body, ts: Date.now() };
}

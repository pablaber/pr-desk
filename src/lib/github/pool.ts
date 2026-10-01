// Bounded concurrency avoids spawning one gh process per request at once.
export async function pool<T>(items: T[], work: (item: T) => Promise<void>) {
  let index = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, items.length) }, async () => {
      while (index < items.length) await work(items[index++]);
    }),
  );
}

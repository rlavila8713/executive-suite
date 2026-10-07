type UploadTask<T> = () => Promise<T>;

const queue: UploadTask<unknown>[] = [];
let running = false;

async function pump(): Promise<void> {
  if (running) return;
  running = true;
  while (queue.length > 0) {
    const task = queue.shift() as UploadTask<unknown>;
    try {
      await task();
    } catch {
      // caller handles errors on the returned promise
    }
  }
  running = false;
}

/** Run async uploads one at a time (FIFO). */
export function enqueueUpload<T>(task: UploadTask<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    queue.push(async () => {
      try {
        resolve(await task());
      } catch (err) {
        reject(err);
      }
    });
    void pump();
  });
}

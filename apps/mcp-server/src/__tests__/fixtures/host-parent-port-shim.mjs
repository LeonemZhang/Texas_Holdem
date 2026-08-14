import process from 'node:process';

Object.defineProperty(process, 'parentPort', {
  value: {
    on(event, listener) {
      if (event !== 'message') return;
      process.on('message', (data) => listener({ data }));
    },
    postMessage(message) {
      process.send?.(message);
    },
  },
});

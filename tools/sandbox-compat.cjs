// Optional build helper for restricted runtimes without /proc. Not used by the app.
const memoryUsage = process.memoryUsage;
process.memoryUsage = Object.assign(
  function () {
    try {
      return memoryUsage();
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      const heap = require("node:v8").getHeapStatistics();
      return {
        rss: 0,
        heapTotal: heap.total_heap_size,
        heapUsed: heap.used_heap_size,
        external: heap.external_memory,
        arrayBuffers: 0,
      };
    }
  },
  {
    rss: () => {
      try {
        return memoryUsage.rss();
      } catch {
        return 0;
      }
    },
  },
);

// const { v4: uuidv4 } = require('uuid');

// const jobs = {};

// module.exports = {
//   createJob(optimizer) {
//     const jobId = uuidv4();
//     jobs[jobId] = {
//       status: 'running',
//       optimizer,
//       result: null,
//       error: null
//     };
//     return jobId;
//   },
//   getJob(jobId) {
//     return jobs[jobId];
//   },
//   setCompleted(jobId, result) {
//     if (jobs[jobId]) {
//       jobs[jobId].status = 'completed';
//       jobs[jobId].result = result;
//     }
//   },
//   setError(jobId, error) {
//     if (jobs[jobId]) {
//       jobs[jobId].status = 'error';
//       jobs[jobId].error = error;
//     }
//   },
//   cancelJob(jobId) {
//     if (jobs[jobId]) {
//       jobs[jobId].optimizer.cancel();
//       jobs[jobId].status = 'cancelled';
//     }
//   }
// };
const { v4: uuidv4 } = require('uuid');

const jobs = {};

module.exports = {
  createJob(optimizer) {
    const jobId = uuidv4();
    jobs[jobId] = {
      status: 'running',
      optimizer,
      result: null,
      error: null,
      createdAt: new Date()
    };
    return jobId;
  },

  getJob(jobId) {
    return jobs[jobId];
  },

  setCompleted(jobId, result) {
    if (jobs[jobId]) {
      jobs[jobId].status = 'completed';
      jobs[jobId].result = result;
      jobs[jobId].completedAt = new Date();
    }
  },

  setError(jobId, error) {
    if (jobs[jobId]) {
      jobs[jobId].status = 'error';
      jobs[jobId].error = error;
      jobs[jobId].errorAt = new Date();
    }
  },

  cancelJob(jobId) {
    if (jobs[jobId]) {
      // Check if optimizer has cancel method before calling it
      if (jobs[jobId].optimizer && typeof jobs[jobId].optimizer.cancel === 'function') {
        console.log(`🛑 Cancelling job ${jobId}`);
        jobs[jobId].optimizer.cancel();
      }
      jobs[jobId].status = 'cancelled';
      jobs[jobId].cancelledAt = new Date();
    }
  },

  // Optional: Clean up old jobs to prevent memory leaks
  cleanupOldJobs(maxAgeMinutes = 60) {
    const cutoff = new Date(Date.now() - maxAgeMinutes * 60 * 1000);
    for (const [jobId, job] of Object.entries(jobs)) {
      if (job.createdAt < cutoff && job.status !== 'running') {
        delete jobs[jobId];
        console.log(`🧹 Cleaned up old job ${jobId}`);
      }
    }
  },

  // Optional: Get all jobs (for debugging)
  getAllJobs() {
    return jobs;
  }
};
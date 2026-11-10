// A local Storage emulator can reset an idle keep-alive connection after a
// long CPU render. Retry that read once; never retry admission or execution.
async function localStorageRead(read) {
  try {
    return await read();
  } catch (error) {
    const code = error?.code || error?.cause?.code;
    if (!['ECONNRESET', 'EPIPE', 'ECONNREFUSED'].includes(code) &&
        !/socket hang up|connection reset/i.test(String(error?.message || '')))
      throw error;
    return read();
  }
}
module.exports = { localStorageRead };

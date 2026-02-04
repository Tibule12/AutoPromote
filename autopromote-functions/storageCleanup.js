const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");

// exports.cleanupTempUploads = functions.pubsub.schedule("every 24 hours").onRun(async context => {
//   const bucket = admin.storage().bucket();
//   const tempFolder = "temp_sources/";
//   const now = Date.now();
//   const ONE_DAY_MS = 24 * 60 * 60 * 1000;

//   try {
//     const [files] = await bucket.getFiles({ prefix: tempFolder });

//     console.log(`Checking ${files.length} files in ${tempFolder} for cleanup...`);

//     const deletePromises = files.map(async file => {
//         // Skip the folder placeholder itself if it exists
//         if (file.name === tempFolder) return;

//         const [metadata] = await file.getMetadata();
//         const createdTime = new Date(metadata.timeCreated).getTime();
        
//         if (now - createdTime > ONE_DAY_MS) {
//             console.log(`Deleting old temp file: ${file.name}`);
//             return file.delete();
//         }
//     });

//     await Promise.all(deletePromises);
//     console.log("Cleanup complete");
//     return null;
//   } catch (error) {
//     console.error("Error cleaning up temp files:", error);
//     return null;
//   }
// });

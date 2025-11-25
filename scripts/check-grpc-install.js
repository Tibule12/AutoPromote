const fs = require('fs');
const path = require('path');

try {
  const grpcPkgPath = require.resolve('@grpc/grpc-js/package.json');
  const grpcPkg = require('@grpc/grpc-js/package.json');
  const base = path.dirname(grpcPkgPath);
  const potential = [
    path.join(base, 'build', 'src', 'single-subchannel-channel.js'),
    path.join(base, 'build', 'src', 'single_subchannel_channel.js'),
    path.join(base, 'src', 'single-subchannel-channel.js'),
    path.join(base, 'build', 'src', 'subchannel', 'single-subchannel-channel.js')
  ];
  const found = potential.find(p => fs.existsSync(p));
  console.log('Found @grpc/grpc-js', grpcPkg.version, 'at', grpcPkgPath);
  if (!found) {
    console.error('single-subchannel-channel.js not found at expected locations for @grpc/grpc-js. Searched:', potential.join(', '));
    process.exit(2);
  } else {
    console.log('Found single-subchannel-channel file at', found);
    process.exit(0);
  }
} catch (e) {
  console.error('Failed to require @grpc/grpc-js:', e && e.message);
  process.exit(1);
}

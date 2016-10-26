var Realtime = require('./main');

var realtime = new Realtime({defaultTopics:[Realtime.topic('VIDEOPLAYBACK','monstercat')]});

realtime.on('viewcount',console.log);

realtime.on('stream-up',console.log);

realtime.on('stream-down',console.log);

realtime.on('connect',()=>console.log('connect'));

realtime.on('close',console.log);

realtime.on('raw',console.log);

console.log(realtime);

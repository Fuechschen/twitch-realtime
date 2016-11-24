# Twitch-Realtime 
[![NPM version](https://img.shields.io/npm/v/twitch-realtime.svg?style=flat-square)](https://npmjs.com/package/twitch-realtime) [![npm](https://img.shields.io/npm/l/twitch-realtime.svg?style=flat-square)]() [![npm](https://img.shields.io/npm/dm/twitch-reailtime.svg?style=flat-square)]() [![dependencies Status](https://david-dm.org/Fuechschen/twitch-realtime/status.svg?style=flat-square)](https://david-dm.org/Fuechschen/twitch-realtime)

Twitch realtime is a little library to interact with twitch's PubSub-Realtime Api.

You can install it with

```npm install --save twitch-realtime```

Use it in your project:

```js
var Realtime = require('twitch-realtime');

var realtime = new Realtime({defaultTopics:[Realtime.topic(Realtime.TOPICS.VIDEOPLAYBACK,'example-channel')]});

realtime.on('stream-up',(data)=>{
    /*do stuff
        { time: 13246, //current time on the server
          channel: 'channel', //channel which went online
          play_delay: 15 //Stream delay in seconds
        }        
    */
});

realtime.on('stream-down',(data)=>{
    /*do stuff
         { time: 13246, //current time on the server
           channel: 'channel' //channel which went offline
         }
     */
});

realtime.on('viewcount',(data)=>{
    /*do stuff
          { time: 13246, //current time on the server
            channel: 'channel', //channel which viewcount changed
            viewers: 123 //new viewercount
          }
    */
});

realtime.on('bits',(data)=>{
    /*do stuff
          { user_name: 'username', //username of bits cheerer
            channel_name: 'channel', //channel which user cheered
            time: 123456, //server time of donation
            chat_message: 'Message', //message sent with bits cheer
            bits_used: 123, //amount cheered by user
            total_bits_used: 9999, //total amount cheered ever by user to this specific channel
            context: 'cheer'  //context of cheer
          }
    */
});

//subscribe to a new topic
realtime.listen(Realtime.topic(Realtime.TOPICS.VIDEOPLAYBACK,'another-channel'));

//unsubscribe from a topic
realtime.unlisten(Realtime.topic(Realtime.TOPICS.VIDEOPLAYBACK,'another-channel'));
```

You can listen on the following topics:

|Topic|Description|Constant|Requires Token|
|---|---|---|---|
|Videoplayback|get updates about stream status and viewcounts|Realtime.TOPICS.VIDEOPLAYBACK|No|
|Bits|get updates about the Bits on the chat|Realtime.TOPICS.BITS|Yes|

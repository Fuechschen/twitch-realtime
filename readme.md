# Twitch-Realtime 
[![NPM version](https://img.shields.io/npm/v/twitch-realtime.svg?style=flat-square)](https://npmjs.com/package/twitch-realtime) [![npm](https://img.shields.io/npm/l/twitch-realtime.svg?style=flat-square)]() [![npm](https://img.shields.io/npm/dm/twitch-reailtime.svg?style=flat-square)]() [![dependencies Status](https://david-dm.org/Fuechschen/twitch-realtime/status.svg?style=flat-square)](https://david-dm.org/Fuechschen/twitch-realtime) [![Build Status](https://img.shields.io/travis/Fuechschen/twitch-realtime/master.svg?style=flat-square)](https://github.com/Fuechschen/twitch-realtime)

Twitch realtime is a little library to interact with twitch's PubSub-Realtime Api.

You can install it with

```npm install --save twitch-realtime```

Have a look at the [docs](https://fuechschen.me/twitch-realtime/TwitchRealtime.html)

You can listen on the following topics:

|Topic|Description|Constant|Requires Token|
|---|---|---|---|
|Videoplayback|get updates about stream status and viewcounts|Realtime.TOPICS.VIDEOPLAYBACK|No|
|Bits|get updates about the Bits on the chat|Realtime.TOPICS.BITS|Yes|
|Whispers|Get incoming whispers|Realtime.TOPICS.WHISPERS|Yes|

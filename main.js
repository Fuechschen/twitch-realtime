var WebSocket = require('ws'),
    shortid = require('shortid'),
    Promise = require('bluebird'),
    EventEmitter = require('events');

var URL = 'wss://pubsub-edge.twitch.tv';

class TwitchPubSub extends EventEmitter {
    constructor(options = {reconnect: true, defaultTopics: [], authToken: null}) {
        super();
        if (options.defaultTopics.length < 1)throw new Error('missing default topic');
        this._token = options.authToken;
        this._autoreconnect = options.reconnect || true;

        this._pending = {};
        this._initial = null;
        this._tries = 0;
        this._pingInterval = null;
        this._pingTimeout = null;
        this._topics = options.defaultTopics;

        this._connect();
    }

    _connect() {
        if (this._ws && (this._ws.readyState === WebSocket.OPEN || this._ws.readyState === WebSocket.CONNECTING))return;
        this._ws = new WebSocket(URL);

        this._ws.on('open', () => {
            this._initial = shortid.generate();
            this._ws.send(JSON.stringify({
                type: 'LISTEN',
                nonce: this._initial,
                data: {topics: this._topics, auth_token: (this._token ? this._token : undefined)}
            }));
            this.emit('connect');
        });

        this._ws.on('close', () => {
            if (this._autoreconnect) {
                setTimeout(() => {
                    this._ws = new WebSocket(URL);
                }, 1000 * this._tries);
                this._tries++;
            }
            clearInterval(this._pingInterval);
            clearTimeout(this._pingTimeout);
            this._pingInterval = null;
            this._pingTimeout = null;
            this.emit('close', this._autoreconnect);
        });

        this._ws.on('message', (msg) => {
            try {
                msg = JSON.parse(msg);
                this.emit('raw', msg);
                if (msg.type === 'RESPONSE') {
                    if (msg.nonce === this._initial) {
                        this._initial = null;
                        if (msg.error !== "") this.emit('error', 'Error while subscribing to initial topics', msg.error);
                    } else {
                        if (this._pending[msg.nonce]) {
                            if (msg.error !== "") this._pending[msg.nonce].reject(msg.error);
                            else this._pending[msg.nonce].resolve();
                            delete this._pending[msg.nonce];
                        } else this.emit('warn', 'Received message for unknown nonce.');
                    }
                } else if (msg.type === 'MESSAGE') {
                    var split = msg.data.topic.split('.');
                    var topic = split[0];
                    var channel = split[1];
                    if (typeof msg.data.message === 'string') msg.data.message = JSON.parse(msg.data.message);
                    if (topic === 'video-playback') {
                        if (msg.data.message.type === 'stream-up') {
                            this.emit('stream-up', {
                                time: msg.data.message.server_time,
                                channel,
                                play_delay: msg.data.message.play_delay
                            });
                        } else if (msg.data.message.type === 'stream-down') {
                            this.emit('stream-up', {
                                time: msg.data.message.server_time,
                                channel
                            });
                        } else if (msg.data.message.type === 'viewcount') {
                            this.emit('viewcount', {
                                time: msg.data.message.server_time,
                                channel,
                                viewers: msg.data.message.viewers
                            });
                        }
                    } else if (topic.includes('whispers')) {
                        //todo
                    }
                } else if (msg.type === 'PONG') {
                    clearTimeout(this._pingTimeout);
                    this._pingTimeout = null;
                }
                else if (msg.type === 'RECONNECT') this._reconnect();
                else this.emit('warn', 'Received unknown message type. Maybe this package is outdated?');
            } catch (e) {
                this.emit('debug', e);
                this.emit('warn', 'Failed to parse websocket message', msg);
            }
        });

        this._pingInterval = setInterval(() => {
            if (this._ws.readyState === WebSocket.OPEN) {
                this._ws.send(JSON.stringify({type: 'PING'}));
                this._pingTimeout = setTimeout(() => this._reconnect(1000), 15000);
            }
        }, 300000);
    }

    _reconnect(timeout) {
        this._ws.terminate();
        setTimeout(() => {
            this._connect();
        }, timeout);
    }

    listen(topic) {
        return new Promise((resolve, reject) => {
            if (!topic)return reject(new Error('topic can not be a falsy value.'));

            if (this._ws.readyState !== WebSocket.OPEN) this._connect();

            var nonce = shortid.generate();
            this._pending[nonce] = {
                resolve: () => {
                    if (Array.isArray(topic)) topic.map(t => this._topics.push(t));
                    else this._topics.push(topic);
                    delete this._pending[nonce];
                    resolve();
                },
                reject: (err) => {
                    reject(err);
                    delete this._pending[nonce];
                }
            };
            this._ws.send(JSON.stringify({
                type: 'LISTEN',
                nonce,
                data: {
                    auth_token: this._token,
                    topics: Array.isArray(topic) ? topic : [topic]
                }
            }));
            setTimeout(() => {
                if (this._pending[nonce]) this._pending[nonce].reject('timeout');
            }, 10000);
        });
    }

    unlisten(topic) {
        return new Promise((resolve, reject) => {
            if (!topic)return reject(new Error('topic can not be a falsy value.'));

            if (this._ws.readyState !== WebSocket.OPEN) this._connect();

            var nonce = shortid.generate();
            this._pending[nonce] = {
                resolve: () => {
                    var removeTopic = (t) => {
                        var index = this._topics.indexOf(t);
                        if (index != -1) {
                            this._topics.splice(index, 1);
                        }
                    };
                    if (Array.isArray(topic)) topic.map(removeTopic);
                    else removeTopic(topic);
                    resolve();
                    delete this._pending[nonce];
                },
                reject: (err) => {
                    reject(err);
                    delete this._pending[nonce];
                }
            };
            this._ws.send(JSON.stringify({
                type: 'UNLISTEN',
                nonce,
                data: {
                    auth_token: this._token,
                    topics: Array.isArray(topic) ? topic : [topic]
                }
            }));
            setTimeout(() => {
                if (this._pending[nonce]) this._pending[nonce].reject('timeout');
            }, 10000);
        });
    }

    static get TOPICS() {
        return {
            WHISPERS: 'whispers',
            VIDEOPLAYBACK: 'video-playback'
        };
    }

    static topic(type, channel) {
        return `${TwitchPubSub.TOPICS[type] || type}.${channel}`;
    }
}

module.exports = TwitchPubSub;
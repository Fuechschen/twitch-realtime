//noinspection SpellCheckingInspection
let WebSocket = require('ws'),
    shortid = require('shortid'),
    Promise = require('bluebird'),
    EventEmitter = require('events');

const URL = 'wss://pubsub-edge.twitch.tv';

class TwitchPubSub extends EventEmitter {
    /** @namespace msg.data.message.server_time */
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
                    let split = msg.data.topic.split('.'),
                        topic = split[0],
                        channel = split[1];
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
                        } else { //noinspection SpellCheckingInspection
                            if (msg.data.message.type === 'viewcount') {
                                //noinspection SpellCheckingInspection
                                this.emit('viewcount', {
                                    time: msg.data.message.server_time,
                                    channel,
                                    viewers: msg.data.message.viewers
                                });
                            }
                        }
                    } else if (topic.includes('whispers')) {
                        /** @namespace msg.data.message.tags */
                        /** @namespace msg.data.message.from_id */
                        /** @namespace msg.data.message.tags.login */
                        /** @namespace msg.data.message.thread_id */
                        this.emit('whisper', {
                            id: msg.data.message.data.id,
                            content: msg.data.message.body,
                            thread: msg.data.message.thread_id,
                            sender: {
                                id: msg.data.message.from_id,
                                username: msg.data.message.tags.login,
                                display_name: msg.data.message.tags.display_name,
                                color: msg.data.message.tags.color,
                                badges: msg.data.message.tags.badges,
                                emotes: msg.data.message.tags.emotes
                            },
                            recipient: msg.data.message.recipient,
                            send_ts: msg.data.message.send_ts,
                            nonce: msg.data.message.nonce
                        })
                    } else { //noinspection SpellCheckingInspection
                        if (topic === 'channel-bitsevents') {
                            this.emit('bits', {
                                user_name: msg.data.message.user_name,
                                channel_name: msg.data.message.channel_name,
                                time: msg.data.message.time,
                                chat_message: msg.data.message.chat_message,
                                bits_used: msg.data.message.bits_used,
                                total_bits_used: msg.data.message.bits_used,
                                context: msg.data.message.context
                            });
                        }
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

    //noinspection JSMethodCanBeStatic
    _requiresAuth(topic) {
        //noinspection SpellCheckingInspection
        return ['channel-bitsevents', 'whispers'].includes(topic.split('.')[0]);
    }

    listen(topic, token) {
        return new Promise((resolve, reject) => {
            if (!topic) { //noinspection SpellCheckingInspection
                return reject(new Error('topic can not be a falsy value.'));
            }

            if (Array.isArray(topic)) {
                for (let t of topic) {
                    if (this._requiresAuth(t) && (!this._token || !token))return reject(new Error('this topic requires an authentication'));
                }
            } else if (this._requiresAuth(topic) && (!this._token || !token))return reject(new Error('this topic requires an authentication'));

            if (this._ws.readyState !== WebSocket.OPEN) this._connect();

            let nonce = shortid.generate();
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
                    auth_token: token || this._token,
                    topics: Array.isArray(topic) ? topic : [topic]
                }
            }));
            setTimeout(() => {
                if (this._pending[nonce]) this._pending[nonce].reject('timeout');
            }, 10000);
        });
    }

    //noinspection SpellCheckingInspection
    unlisten(topic) {
        return new Promise((resolve, reject) => {
            if (!topic) { //noinspection SpellCheckingInspection
                return reject(new Error('topic can not be a falsy value.'));
            }

            if (this._ws.readyState !== WebSocket.OPEN) this._connect();

            let nonce = shortid.generate();
            this._pending[nonce] = {
                resolve: () => {
                    let removeTopic = (t) => {
                        let index = this._topics.indexOf(t);
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
            //noinspection SpellCheckingInspection
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
        //noinspection SpellCheckingInspection
        return {
            WHISPERS: 'whispers',
            VIDEOPLAYBACK: 'video-playback',
            BITS: 'channel-bitsevents'
        };
    }

    static topic(type, channel) {
        return `${TwitchPubSub.TOPICS[type] || type}.${channel}`;
    }
}

module.exports = TwitchPubSub;

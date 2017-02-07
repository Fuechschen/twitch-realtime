//noinspection SpellCheckingInspection
let WebSocket = require('ws'),
    shortid = require('shortid'),
    Promise = require('bluebird'),
    EventEmitter = require('events');

const URL = 'wss://pubsub-edge.twitch.tv';

/**
 * Represents a connection to twitch.
 * @property {Number} topicCount The current count of topics.
 * @property {Boolean} acceptNewTopics If the connection will accept new topics or not.
 */

class TwitchRealtime extends EventEmitter {
    /**
     * @constructor
     * @param options Settings for the new Realtime-object
     * @param {Array<String>?} options.defaultTopics The first topic to listen to. This is mandatory or twitch will return an error.
     * @param {Boolean} [options.reconnect=true] Set this to false if you do not want twitch-realtime to automatically reconnect if the connection is lost.
     * @param {String} [options.authToken=null] The default authToken. This is sent for 'listen'-commands if no other token was specified.
     */
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

        //expose static methods also on objects
        this.TOPICS = TwitchRealtime.TOPICS;
        this.topic = TwitchRealtime.topic;
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

            /**
             * Fired when the connection is opened and the initial 'listen'-payload was sent.
             * @event TwitchRealtime#connect
             */
            this.emit('connect');
        });

        this._ws.on('close', () => {
            if (this._autoreconnect) {
                setTimeout(() => {
                    this._ws = new WebSocket(URL);
                }, 1000 * this._tries);
                this._tries += 1;
            }
            clearInterval(this._pingInterval);
            clearTimeout(this._pingTimeout);
            this._pingInterval = null;
            this._pingTimeout = null;
            /**
             * Fired when the connection to twitch was lost.
             * @event TwitchRealtime#close
             * @prop {Boolean} If twitch-realtime will try to reconnect automatically or not.
             */
            this.emit('close', this._autoreconnect);
        });

        this._ws.on('message', (msg) => {
            try {
                msg = JSON.parse(msg);
                //noinspection JSUnresolvedFunction
                /**
                 * Fired on raw input from twitch
                 * @event TwitchRealtime#raw
                 * @prop {Object} data Raw data from twitch.
                 */
                this.emit('raw', Object.assign({}, msg));
                if (msg.type === 'RESPONSE') {
                    if (msg.nonce === this._initial) {
                        this._initial = null;
                        if (msg.error !== "") this.emit('error', 'Error while subscribing to initial topics', msg.error);
                    } else {
                        if (this._pending[msg.nonce]) {
                            if (msg.error !== "") this._pending[msg.nonce].reject(msg.error);
                            else this._pending[msg.nonce].resolve();
                            delete this._pending[msg.nonce];
                        } else {
                            /**
                             * Emitted if something weird happens.
                             * @event TwitchRealtime#warn
                             * @prop {String} message The warning message.
                             */
                            this.emit('warn', 'Received message for unknown nonce.');
                        }
                    }
                } else if (msg.type === 'MESSAGE') {
                    let split = msg.data.topic.split('.'),
                        topic = split[0],
                        channel = split[1];
                    if (typeof msg.data.message === 'string') msg.data.message = JSON.parse(msg.data.message);
                    if (topic === 'video-playback') {
                        if (msg.data.message.type === 'stream-up') {
                            //noinspection JSUnresolvedVariable
                            /**
                             * Emitted when a stream goes up.
                             * @event TwitchRealtime#stream-up
                             * @prop {Object} data
                             * @prop {String} data.time The time from the twitch servers.
                             * @prop {String} data.channel The channel-name on twitch.
                             * @prop {String} playDelay Delay artificially inserted to stream by twitch.
                             */
                            this.emit('stream-up', {
                                time: msg.data.message.server_time,
                                channel,
                                play_delay: msg.data.message.play_delay,
                                playDelay: msg.data.message.play_delay
                            });
                        } else if (msg.data.message.type === 'stream-down') {
                            //noinspection JSUnresolvedVariable
                            /**
                             * Emitted when a stream goes down.
                             * @event TwitchRealtime#stream-down
                             * @prop {Object} TwitchRealtime#data
                             * @prop {String} data.time The time from the twitch servers.
                             * @prop {String} data.channel The channel-name on twitch.
                             */
                            this.emit('stream-down', {
                                time: msg.data.message.server_time,
                                channel
                            });
                        } else { //noinspection SpellCheckingInspection
                            if (msg.data.message.type === 'viewcount') {
                                //noinspection SpellCheckingInspection,JSUnresolvedVariable
                                /**
                                 * Emitted when twitch updates the viewcount
                                 * @event TwitchRealtime#viewcount
                                 * @prop {Object} data
                                 * @prop {String} data.time The time from the twitch servers.
                                 * @prop {String} data.channel The channel-name on twitch.
                                 * @prop {Number} data.viewers The new viewcount.
                                 */
                                this.emit('viewcount', {
                                    time: msg.data.message.server_time,
                                    channel,
                                    viewers: msg.data.message.viewers
                                });
                            }
                        }
                    } else if (topic.includes('whispers')) {
                        //noinspection JSUnresolvedVariable
                        /**
                         * Emitted when a new whisper is received.
                         * @event TwitchRealtime#whisper
                         * @prop {Object} data
                         * @prop {String} data.id The message id from twitch.
                         * @prop {String} data.content The message content.
                         * @prop {String} data.thread The id of the thread.
                         * @prop {Object} data.sender The sender.
                         * @prop {String} data.sender.id The id of the message-sender.
                         * @prop {String} data.sender.username The username of the message-sender.
                         * @prop {String} data.sender.displayName The display-name of the message-sender (usually only differs in case from username).
                         * @prop {String} data.sender.color Color HEX-code
                         * @prop {Array<Object>?} data.sender.badges The sender badges.
                         * @prop {Array<Obejct>?} data.sender.emotes
                         * @prop {Object} data.recipient The message recipient. Has the same keys as data.sender.
                         * @prop {String} data.sendTs
                         * @prop {String} data.nonce
                         */
                        this.emit('whisper', {
                            id: msg.data.message.data.id,
                            content: msg.data.message.body,
                            thread: msg.data.message.thread_id,
                            sender: {
                                id: msg.data.message.from_id,
                                username: msg.data.message.tags.login,
                                display_name: msg.data.message.tags.display_name,
                                displayName: msg.data.message.tags.display_name,
                                color: msg.data.message.tags.color,
                                badges: msg.data.message.tags.badges,
                                emotes: msg.data.message.tags.emotes
                            },
                            recipient: msg.data.message.recipient,
                            send_ts: msg.data.message.send_ts,
                            sendTs: msg.data.message.send_ts,
                            nonce: msg.data.message.nonce
                        });
                    } else { //noinspection SpellCheckingInspection
                        if (topic === 'channel-bitsevents') {
                            /**
                             * Emitted when some sends a bits.
                             * @event TwitchRealtime#bits
                             * @prop {String} username The user who sent a bit.
                             * @prop {String} channelName The channel the bit was sent to.
                             * @prop {String} time The time the bit was sent.
                             * @prop {String} chatMessage The chatmessage that was sent with the bit.
                             * @prop {Number} bitsUsed Number of bits used.
                             * @prop {Number} totalBitsUsed The total number of bits the sending user has ever sent for that channel.
                             * @prop {String} context The context the bit was sent in.
                             */
                            this.emit('bits', {
                                user_name: msg.data.message.user_name,
                                username: msg.data.message.user_name,
                                channel_name: msg.data.message.channel_name,
                                channelName: msg.data.message.channel_name,
                                time: msg.data.message.time,
                                chat_message: msg.data.message.chat_message,
                                chatMessage: msg.data.message.chat_message,
                                bits_used: msg.data.message.bits_used,
                                bitsUsed: msg.data.message.bits_used,
                                total_bits_used: msg.data.message.bits_used,
                                totalBitsUsed: msg.data.message.bits_used,
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
                /**
                 * Fires when a non-critical error is thrown
                 * @event TwitchRealtime#debug
                 * @prop {Error} error The error object.
                 */
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

    /**
     * Listen to a new topic/ multiple new topics.
     * @param {String | Array<String>} topic Either a single topic or an array of topics.
     * @param {String} [token=null] The authToken to send for authentication to twitch.
     * @return {Promise} A promise that resolves if the topics were successfully subscribed to or rejects if any error occurs.
     */

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

    //noinspection JSUnusedGlobalSymbols
    /**
     * Unlisten to a new topic/ multiple new topics.
     * @param {String | Array<String>} topic Either a single topic or an array of topics.
     * @return {Promise} A promise that resolves if the topics were successfully unsubscribed to or rejects if any error occurs.
     */

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

    get topicCount() {
        return this._topics.length;
    }

    //noinspection JSUnusedGlobalSymbols
    get acceptNewTopics() {
        return this.topicCount < 50;
    }

    /**
     * Constant containing all supported topic-types for generating topics. TOPICS.WHISPERS, TOPICS.BITS or TOPICS.VIDEOPLAYBACK)
     * @return {Object} An object containing all topic-types twitch-realtime currently supports. (TOPICS.WHISPERS, TOPICS.BITS or TOPICS.VIDEOPLAYBACK)
     */

    static get TOPICS() {
        //noinspection SpellCheckingInspection
        return {
            WHISPERS: 'whispers',
            VIDEOPLAYBACK: 'video-playback',
            BITS: 'channel-bitsevents'
        };
    }

    /**
     * StringBuilder for a topic.
     * @param {String} type The topic-type. For ease of use, use the constants provided by Realtime.TOPICS
     * @param {String} channel The channel the topic should be generated for.
     * @return {String} topic The full topic as string ready to be passed to .listen or .unlisten
     */

    static topic(type, channel) {
        return `${TwitchRealtime.TOPICS[type] || type}.${channel}`;
    }
}

module.exports = TwitchRealtime;

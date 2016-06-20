"use strict";

define(['ably', 'shared_helper'], function(Ably, helper) {
	var exports = {},
		_exports = {},
		rest,
		publishAtIntervals = function(numMessages, channel, dataFn, onPublish){
			for(var i = numMessages; i > 0; i--) {
				var helper = function(currentMessageNum) {
					console.log('sending: ' + currentMessageNum);
					channel.publish('event0', dataFn(), function(err) {
						console.log('publish callback called');
						onPublish();
					});
				};
				setTimeout(helper(i), 20*i);
			}
		},
		displayError = helper.displayError,
		closeAndFinish = helper.closeAndFinish,
		monitorConnection = helper.monitorConnection,
		bestTransport = helper.bestTransport;

	exports.setupUpgrade = function(test) {
		test.expect(1);
		helper.setupApp(function(err) {
			if(err) {
				test.ok(false, helper.displayError(err));
			} else {
				test.ok(true, 'app set up');
			}
			test.done();
		});
	};

	exports.setupUpgradeRest = function(test) {
		test.expect(1);
		rest = helper.AblyRest();
		test.ok(true, 'rest client set up');
		test.done();
	};

	if(isBrowser && window.localStorage) {
		/* run before each test to ensure starting from a fresh state */
		exports.setUp = function(callback) {
			console.log('Clearing transport preference from localstorage');
			helper.clearTransportPreference();
			callback();
		};
	}

	/*
	 * Publish once with REST, before upgrade, verify message received
	 */
	_exports.publishpreupgrade = function(test) {
		var transportOpts = {useBinaryProtocol: true};
		test.expect(1);
		try {
			var realtime = helper.AblyRealtime(transportOpts);
			/* connect and attach */
			realtime.connection.on('connected', function() {
				//console.log('publishpreupgrade: connected');
				var testMsg = 'Hello world';
				var rtChannel = realtime.channels.get('publishpreupgrade');
				rtChannel.attach(function(err) {
					if(err) {
						test.ok(false, 'Attach failed with error: ' + helper.displayError(err));
						closeAndFinish(test, realtime);
						return;
					}

					/* subscribe to event */
					rtChannel.subscribe('event0', function(msg) {
						test.expect(2);
						test.ok(true, 'Received event0');
						test.equal(msg.data, testMsg, 'Unexpected msg text received');
						closeAndFinish(test, realtime);
					});

					/* publish event */
					var restChannel = rest.channels.get('publishpreupgrade');
					restChannel.publish('event0', testMsg, function(err) {
						if(err) {
							test.ok(false, 'Publish failed with error: ' + helper.displayError(err));
							closeAndFinish(test, realtime);
						}
					});
				});
			});
			monitorConnection(test, realtime);
		} catch(e) {
			test.ok(false, 'Channel attach failed with exception: ' + e.stack);
			closeAndFinish(test, realtime);
		}
	};

	/*
	 * Publish once with REST, after upgrade, verify message received on active transport
	 */
	_exports.publishpostupgrade0 = function(test) {
		var transportOpts = {useBinaryProtocol: true};
		test.expect(1);
		try {
			var realtime = helper.AblyRealtime(transportOpts);

			/* subscribe to event */
			var rtChannel = realtime.channels.get('publishpostupgrade0');
			rtChannel.subscribe('event0', function(msg) {
				test.expect(2);
				test.ok(true, 'Received event0');
				test.equal(msg.data, testMsg, 'Unexpected msg text received');
				var closeFn = function() {
					closeAndFinish(test, realtime);
				};
				if (isBrowser)
					setTimeout(closeFn, 0);
				else
					process.nextTick(closeFn);
			});

			/* publish event */
			var testMsg = 'Hello world';
			var restChannel = rest.channels.get('publishpostupgrade0');
			var connectionManager = realtime.connection.connectionManager;
			connectionManager.on('transport.active', function(transport) {
				//console.log('publishpostupgrade0: transport active: transport = ' + transport);
				if(transport.toString().match(/wss?\:/)) {
					if(rtChannel.state == 'attached') {
						//console.log('*** publishpostupgrade0: publishing (channel attached on transport active) ...');
						restChannel.publish('event0', testMsg, function(err) {
							//console.log('publishpostupgrade0: publish returned err = ' + displayError(err));
							if(err) {
								test.ok(false, 'Publish failed with error: ' + displayError(err));
								closeAndFinish(test, realtime);
							}
						});
					} else {
						rtChannel.on('attached', function() {
							//console.log('*** publishpostupgrade0: publishing (channel attached after wait) ...');
							restChannel.publish('event0', testMsg, function(err) {
								//console.log('publishpostupgrade0: publish returned err = ' + displayError(err));
								if(err) {
									test.ok(false, 'Publish failed with error: ' + displayError(err));
									closeAndFinish(test, realtime);
								}
							});
						});
					}
				}
			});
			monitorConnection(test, realtime);
		} catch(e) {
			test.ok(false, 'Channel attach failed with exception: ' + e.stack);
			closeAndFinish(test, realtime);
		}
	};

	/*
	 * Publish once with REST, after upgrade, verify message not received on inactive transport
	 */
	_exports.publishpostupgrade1 = function(test) {
		var transportOpts = {useBinaryProtocol: true};
		test.expect(1);
		try {
			var realtime = helper.AblyRealtime(transportOpts);

			/* subscribe to event */
			var rtChannel = realtime.channels.get('publishpostupgrade1');
			rtChannel.subscribe('event0', function(msg) {
				test.expect(2);
				test.ok(true, 'Received event0');
				test.equal(msg.data, testMsg, 'Unexpected msg text received');
				var closeFn = function() {
					closeAndFinish(test, realtime);
				};
				if (isBrowser)
					setTimeout(closeFn, 0);
				else
					process.nextTick(closeFn);
			});

			/* publish event */
			var testMsg = 'Hello world';
			var restChannel = rest.channels.get('publishpostupgrade1');
			var connectionManager = realtime.connection.connectionManager;
			connectionManager.on('transport.active', function(transport) {
				if(transport.toString().indexOf('/comet/') > -1) {
					/* override the processing of incoming messages on this channel
					 * so we can see if a message arrived.
					 * NOTE: this relies on knowledge of the internal implementation
					 * of the transport */

					var originalOnProtocolMessage = transport.onProtocolMessage;
					transport.onProtocolMessage = function(message) {
						if(message.messages)
							test.ok(false, 'Message received on comet transport');
						originalOnProtocolMessage.apply(this, arguments);
					};
				}
			});
			connectionManager.on('transport.active', function(transport) {
				if(transport.toString().match(/wss?\:/)) {
					if(rtChannel.state == 'attached') {
						//console.log('*** publishing (channel attached on transport active) ...');
						restChannel.publish('event0', testMsg);
					} else {
						rtChannel.on('attached', function() {
							//console.log('*** publishing (channel attached after wait) ...');
							restChannel.publish('event0', testMsg);
						});
					}
				}
			});

			monitorConnection(test, realtime);
		} catch(e) {
			test.ok(false, 'Channel attach failed with exception: ' + e.stack);
			closeAndFinish(test, realtime);
		}
	};

	/**
	 * Publish and subscribe, text protocol
	 */
	_exports.upgradepublish0 = function(test) {
		var count = 10;
		var cbCount = 10;
		var checkFinish = function() {
			if(count <= 0 && cbCount <= 0) {
				closeAndFinish(test, realtime);
			}
		};
		var onPublish = function() {
			--cbCount;
			checkFinish();
		};
		var transportOpts = {useBinaryProtocol: false};
		var realtime = helper.AblyRealtime(transportOpts);
		test.expect(count);
		var channel = realtime.channels.get('upgradepublish0');
		/* subscribe to event */
		channel.subscribe('event0', function() {
			test.ok(true, 'Received event0');
			--count;
			checkFinish();
		});
		var dataFn = function() { return 'Hello world at: ' + new Date() };
		publishAtIntervals(count, channel, dataFn, onPublish);
	};

	/**
	 * Publish and subscribe, binary protocol
	 */
	_exports.upgradepublish1 = function(test) {
		var count = 10;
		var cbCount = 10;
		var checkFinish = function() {
			if(count <= 0 && cbCount <= 0) {
				closeAndFinish(test, realtime);
			}
		};
		var onPublish = function() {
			--cbCount;
			checkFinish();
		};
		var transportOpts = {useBinaryProtocol: true};
		var realtime = helper.AblyRealtime(transportOpts);
		test.expect(count);
		var channel = realtime.channels.get('upgradepublish1');
		/* subscribe to event */
		channel.subscribe('event0', function() {
			test.ok(true, 'Received event0');
			--count;
			checkFinish();
		});
		var dataFn = function() { return 'Hello world at: ' + new Date() };
		publishAtIntervals(count, channel, dataFn, onPublish);
	};

	/*
	 * Base upgrade case
	 */
	_exports.upgradebase0 = function(test) {
		var transportOpts = {useBinaryProtocol: true};
		test.expect(2);
		try {
			var realtime = helper.AblyRealtime(transportOpts);
			/* check that we see the transport we're interested in get activated,
			 * and that we see the comet transport deactivated */
			var failTimer = setTimeout(function() {
				test.ok(false, 'upgrade heartbeat failed (timer expired)');
				closeAndFinish(test, realtime);
			}, 120000);

			var connectionManager = realtime.connection.connectionManager;
			connectionManager.once('transport.inactive', function(transport) {
				if(transport.toString().indexOf('/comet/') > -1)
					test.ok(true, 'verify comet transport deactivated');
			});
			connectionManager.on('transport.active', function(transport) {
				if(transport.toString().match(/wss?\:/)) {
					clearTimeout(failTimer);
					var closeFn = function() {
						test.ok(true, 'verify upgrade to ws transport');
						closeAndFinish(test, realtime);
					};
					if (isBrowser)
						setTimeout(closeFn, 0);
					else
						process.nextTick(closeFn);
				}
			});
			monitorConnection(test, realtime);
		} catch(e) {
			test.ok(false, 'upgrade connect with key failed with exception: ' + e.stack);
			closeAndFinish(test, realtime);
		}
	};

	/*
	 * Check active heartbeat, text protocol
	 */
	_exports.upgradeheartbeat0 = function(test) {
		var transportOpts = {useBinaryProtocol: false};
		test.expect(1);
		try {
			var realtime = helper.AblyRealtime(transportOpts);

			/* when we see the transport we're interested in get activated,
			 * listen for the heartbeat event */
			var failTimer;
			var connectionManager = realtime.connection.connectionManager;
			connectionManager.on('transport.active', function(transport) {
				if(transport.toString().match(/wss?\:/))
					transport.on('heartbeat', function() {
						transport.off('heartbeat');
						clearTimeout(failTimer);
						test.ok(true, 'verify upgrade heartbeat');
						closeAndFinish(test, realtime);
					});
				transport.ping();
			});

			realtime.connection.on('connected', function() {
				failTimer = setTimeout(function() {
					test.ok(false, 'upgrade heartbeat failed (timer expired)');
					closeAndFinish(test, realtime);
				}, 120000);
			});
			monitorConnection(test, realtime);
		} catch(e) {
			test.ok(false, 'upgrade connect with key failed with exception: ' + e.stack);
			closeAndFinish(test, realtime);
		}
	};

	/*
	 * Check active heartbeat, binary protocol
	 */
	_exports.upgradeheartbeat1 = function(test) {
		var transportOpts = {useBinaryProtocol: true};
		test.expect(1);
		try {
			var realtime = helper.AblyRealtime(transportOpts);

			/* when we see the transport we're interested in get activated,
			 * listen for the heartbeat event */
			var failTimer;
			var connectionManager = realtime.connection.connectionManager;
			connectionManager.on('transport.active', function(transport) {
				if(transport.toString().match(/wss?\:/))
					transport.on('heartbeat', function() {
						transport.off('heartbeat');
						clearTimeout(failTimer);
						test.ok(true, 'verify upgrade heartbeat');
						closeAndFinish(test, realtime);
					});
				transport.ping();
			});

			realtime.connection.on('connected', function() {
				failTimer = setTimeout(function() {
					test.ok(false, 'upgrade heartbeat failed (timer expired)');
					closeAndFinish(test, realtime);
				}, 120000);
			});
				monitorConnection(test, realtime);
		} catch(e) {
			test.ok(false, 'upgrade connect with key failed with exception: ' + e.stack);
			closeAndFinish(test, realtime);
		}
	};

	/*
	 * Check heartbeat does not fire on inactive transport, text protocol
	 */
	_exports.upgradeheartbeat2 = function(test) {
		var transportOpts = {useBinaryProtocol: false};
		test.expect(1);
		try {
			var realtime = helper.AblyRealtime(transportOpts);

			/* when we see the transport we're interested in get activated,
			 * listen for the heartbeat event */
			var failTimer, cometTransport, wsTransport;
			var connectionManager = realtime.connection.connectionManager;
			connectionManager.on('transport.active', function(transport) {
				var transportDescription = transport.toString();
				//console.log('active transport: ' + transportDescription);
				if(transportDescription.indexOf('/comet/') > -1) {
					cometTransport = transport;
					cometTransport.on('heartbeat', function () {
						test.ok(false, 'verify heartbeat does not fire on inactive transport');
						closeAndFinish(test, realtime);
					});
				}
				if(transportDescription.match(/wss?\:/)) {
					wsTransport = transport;
					wsTransport.on('heartbeat', function () {
						clearTimeout(failTimer);
						/* wait a couple of seconds to give it time
						 * in case it might still fire */
						test.ok(true, 'verify upgrade heartbeat');
						setTimeout(function () {
							closeAndFinish(test, realtime);
						}, 2000);
					});
					wsTransport.ping();
				}
			});

			realtime.connection.on('connected', function() {
				failTimer = setTimeout(function() {
					test.ok(false, 'upgrade heartbeat failed (timer expired)');
					closeAndFinish(test, realtime);
				}, 120000);
			});
				monitorConnection(test, realtime);
		} catch(e) {
			test.ok(false, 'upgrade connect with key failed with exception: ' + e.stack);
			closeAndFinish(test, realtime);
		}
	};

	/*
	 * Check heartbeat does not fire on inactive transport, binary protocol
	 */
	_exports.upgradeheartbeat3 = function(test) {
		var transportOpts = {useBinaryProtocol: true};
		test.expect(1);
		try {
			var realtime = helper.AblyRealtime(transportOpts);

			/* when we see the transport we're interested in get activated,
			 * listen for the heartbeat event */
			var failTimer, cometTransport, wsTransport;
			var connectionManager = realtime.connection.connectionManager;
			connectionManager.on('transport.active', function(transport) {
				var transportDescription = transport.toString();
				//console.log('active transport: ' + transportDescription);
				if(transportDescription.indexOf('/comet/') > -1) {
					cometTransport = transport;
					cometTransport.on('heartbeat', function () {
						test.ok(false, 'verify heartbeat does not fire on inactive transport');
						closeAndFinish(test, realtime);
					});
				}
				if(transportDescription.match(/wss?\:/)) {
					wsTransport = transport;
					wsTransport.on('heartbeat', function () {
						clearTimeout(failTimer);
						/* wait a couple of seconds to give it time
						 * in case it might still fire */
						test.ok(true, 'verify upgrade heartbeat');
						setTimeout(function() {
							closeAndFinish(test, realtime);
						}, 2000);
					});
					wsTransport.ping();
				}
			});

			realtime.connection.on('connected', function() {
				failTimer = setTimeout(function() {
					test.ok(false, 'upgrade heartbeat failed (timer expired)');
					closeAndFinish(test, realtime);
				}, 120000);
			});
			monitorConnection(test, realtime);
		} catch(e) {
			test.ok(false, 'upgrade connect with key failed with exception: ' + e.stack);
			closeAndFinish(test, realtime);
		}
	};

	exports.unrecoverableUpgrade = function(test) {
		test.expect(6);
		var realtime,
			fakeConnectionKey = 'aaaaa!aaaaaaaaaaaaaaaa-aaaaaaa';

		try {
			/* on base transport active */
			realtime = helper.AblyRealtime({log: {level: 4}, tls: false, useTokenAuth: true});
			realtime.connection.connectionManager.sync = function() {
				console.log("NOOOOo")
				test.ok(false, 'Should not be syncing a failed upgrade');
			};
			realtime.connection.connectionManager.once('transport.active', function(transport) {
				console.log('base active ', transport.toString())
				test.ok(transport.toString().indexOf('/comet/') > -1, 'assert first transport to become active is a comet transport');
				test.equal(realtime.connection.errorReason, null, 'Check connection.errorReason is initially null');
				/* sabotage the upgrade */
				realtime.connection.connectionManager.connectionKey = fakeConnectionKey;

				/* on upgrade failure */
				realtime.connection.once('error', function(error) {
					console.log('connection error ', error)
					test.equal(error.code, 80008, 'Check correct (unrecoverable connection) error');
					test.equal(realtime.connection.errorReason.code, 80008, 'Check error set in connection.errorReason');
					test.equal(realtime.connection.state, 'connected', 'Check still connected');

					/* Check events not still paused */
					var channel = realtime.channels.get('unrecoverableUpgrade');
					channel.attach(function(err) {
						if(err) { test.ok(false, 'Attach error ' + helper.displayError(err)); }
						channel.subscribe(function(msg) {
							console.log("GOT A MSG")
							test.ok(true, 'Successfully received message');
							closeAndFinish(test, realtime);
						});
						channel.publish('msg', null);
					console.log('connection state', realtime.connection.connectionManager.state)
					});
				});
			});
		} catch(e) {
			test.ok(false, 'test failed with exception: ' + e.stack);
			closeAndFinish(test, realtime);
		}
	};

	return module.exports = (bestTransport === 'web_socket') ? helper.withTimeout(exports) : {};
});

//------------------------------------------------------------------------------
// Copyright IBM Corp. 2014
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//------------------------------------------------------------------------------

// Boilerplate setup code
var express = require('express');
var http = require('http');
var path = require('path');
var fs = require('fs');
var redis = require('redis');
var cfEnv = require("cf-env");
var pkg   = require("./package.json");
var app = express();
var cfCore = cfEnv.getCore({name: pkg.name});
var instanceId = cfCore.app && cfCore.app != null ? cfCore.app.instance_id : undefined;

// Express setup
app.set('port', cfCore.port || 3000);
app.use(express.favicon());
app.use(express.logger('dev'));
app.use(express.json());
app.use(express.urlencoded());
app.use(express.methodOverride());
app.use(app.router);
app.use(express.static(path.join(__dirname, 'public')));

//Setup Redis
var redisService = cfEnv.getService('redis-chatter');
var credentials = !redisService || redisService == null ?  
{"host":"127.0.0.1", "port":6379} : redisService.credentials;

// We need 2 Redis clients one to listen for events, one to publish events
var subscriber = redis.createClient(credentials.port, credentials.host);
subscriber.on("error", function(err) {
  console.error('There was an error with the redis client ' + err);
});
var publisher = redis.createClient(credentials.port, credentials.host);
publisher.on("error", function(err) {
  console.error('There was an error with the redis client ' + err);
});
if (credentials.password != '') {
  subscriber.auth(credentials.password);
  publisher.auth(credentials.password);
}

// Subscribe to the message event and listen on the messages channel
subscriber.on('message', function(channel, msg) {
  if(channel === 'messages') {
    while(clients.length > 0) {
      var client = clients.pop();
      client.end(msg);
    }
  }
});
subscriber.subscribe('messages');

// This interval will clean up all the clients every minute to avoid timeouts
setInterval(function() {
  while(clients.length > 0) {
    var client = clients.pop();
    client.writeHeader(204);
    client.end();
  }
}, 60000);

// development only
if ('development' == app.get('env')) {
  app.use(express.errorHandler());
}

var clients = [];

// Server up our static resources
app.get('/', function(req, res) {
  fs.readFile('./public/index.html', function(err, data) {
    res.end(data);
  });
});

// Poll endpoint
app.get('/poll/*', function(req, res) {
  clients.push(res);
});

// Msg endpoint
app.post('/msg', function(req, res) {
  message = req.body;
  message.time = Date.now();
  publisher.publish("messages", JSON.stringify(message));
  res.end();
});

app.get('/instanceId', function(req, res) {
  if(!instanceId) {
    res.writeHeader(204);
    res.end();
  } else {
    res.end(JSON.stringify({
      id : instanceId
    }));
  }
});

http.createServer(app).listen(app.get('port'), function(){
  console.log('Express server listening on port ' + app.get('port'));
});
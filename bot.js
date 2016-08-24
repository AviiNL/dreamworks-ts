try {
    var BattlenetTS = require('../battlenet-ts/battlenet-ts.js'); // bleeding edge version :3
    console.log('-==== USING DEVELOPMENT VERSION ====-');
} catch( ex ) { 
    var BattlenetTS = require('battlenet-ts'); // package version
}

var Datastore = require('nedb');

var db = new Datastore('dreamworks.db');

db.persistence.compactDatafile();
db.loadDatabase();

var guildRanks = {
    0: 'Guild Master',
    1: 'Officer',
    2: 'Officers Alt',
    5: 'Social',
    6: 'Alt',
    7: 'Trial'
};

var tsRanks = {
    0: 'admin',
    1: 'officer',
    2: 'officer',
    5: 'grunt',
    6: 'grunt',
    7: 'social'
}

var bts = new BattlenetTS(JSON.parse(fs.readFileSync('./config.json', 'utf8')));

bts.on('teamspeak.connected', function(tsClient) {
	// The serverquery login is successful, commands can now be sent and received.
	console.log('Teamspeak Connected');
});

bts.on('express.started', function(port, protocol){
	// The webserver (expressjs) is started and reachable on the specified url
	console.log('Express running on port ' + port);
});

bts.on('error', function(err) {
    console.log(err);
})

bts.on('teamspeak.client.connected', function(client) {
	var clid  = client.clid;
    var cluid = client.client_unique_identifier;

    db.findOne({ 'profile.cluid': cluid }, function(err, doc) {
        if(doc === null) {
            bts.send(client, 'Hello there, Please click [url=' + bts.getAuthUrl(clid, cluid) + ']here[/url] to authenticate');
        } else {
            doc.profile.clid = client.clid; // overwrite stored clid
            bts.verifyUser(doc.profile, doc.name);
        }
    });
});

bts.on('teamspeak.chat.received', function(clid, message) {
    if(message.charAt(0) == '!') {
        var args = message.substr(1).split(' ');
        var command = args.shift();

        var cluid = bts.getCluid(clid);

        // dont send a reply immediately
        setTimeout(() => {

            switch(command) {
                case 'help':
                    var helpText = [
                        'You can use the following commands',
                        '!help |-> Shows this help',
                        '!auth |-> Request authentication url',
                        '!characters |-> Get a list of your characters within the guild',
                        '!character [character name] |-> Switch to a different character to authenticate against',
                    ];

                    bts.send(clid, helpText.join('\n'));
                break;
                case 'auth':
                    bts.send(clid, 'Please click [url=' + bts.getAuthUrl(clid, cluid) + ']here[/url] to authenticate');
                break;

                case 'characters':
                    db.findOne({ 'profile.cluid': cluid }, function(err, doc) {
                        if(doc !== null) {
                            bts.getCharacters(doc.profile, function(err, characters) {
                                var chars = [];
                                characters.forEach(function(char) {
                                    chars.push(char.name);
                                });
                                bts.send(clid, 'Your characters are: ' + chars.join(', '));
                            });
                        } else {
                            bts.send(clid, 'You are not authenticated, Please click [url=' + bts.getAuthUrl(clid, cluid) + ']here[/url] to authenticate');
                        }
                    });
                break;
                case 'character':
                    if(args.length < 1) {
                        bts.send(clid, 'Usage: !character [character name], eg. !character aviinl');
                        break;
                    }
                    var character = args.join(' ');
                    db.findOne({ 'profile.cluid': cluid }, (err, doc) => {
                        if (doc !== null) {
                            // todo: check if the character exists?
                            bts.verifyUser(doc.profile, character);
                        } else {
                            bts.send(clid, 'You are not authenticated, Please click [url=' + bts.getAuthUrl(clid, cluid) + ']here[/url] to authenticate');
                        }
                        
                    });
                break;
            }

        }, 500);
    }
});

bts.on('battlenet.user.authenticated', function(profile) {
	db.insert({profile: profile});
});

bts.on('battlenet.user.verified', function(character) {

    db.findOne({'profile.cluid': character.profile.cluid}, function(err,doc) {
        // Make sure they are equal
        delete doc._id;
        doc.profile.clid = character.profile.clid;
        doc.level = character.level;
        doc.achievementPoints = character.achievementPoints;

        // Update stored clid.
        db.update({'profile.cluid': character.profile.cluid}, character, function(err, numAffected, affectedDocuments, upsert) {
            bts.getGuildMember(character, function(err, body) {

                bts.send(character.profile, 'Welcome ' + character.name + ', you have been identified as a ' + guildRanks[body.rank] + ', and are assigned to ' + tsRanks[body.rank] + '. Type !help for commands');

                if(tsRanks[body.rank] == 'social') {
                    bts.unsetGroup(character.profile.clid, 'grunt');
                } else {
                    bts.setGroup(character.profile.clid, tsRanks[body.rank]);
                }
            });

            db.persistence.compactDatafile();
        });
    });
});

bts.on('battlenet.user.notverified', function(error) {
    db.remove({'profile.cluid': error.profile.cluid});
    bts.unsetGroup(error.profile.clid, 'grunt');
    bts.send(error.profile, 'Your verification failed and your permissions, if any, have been revoked');
    setTimeout(() => {
        bts.send(error.profile, 'Hello there, Please click [url=' + bts.getAuthUrl(error.profile.clid, error.profile.cluid) + ']here[/url] to authenticate');
    }, 1000);
});

bts.connect();

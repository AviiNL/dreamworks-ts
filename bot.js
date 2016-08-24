var BattlenetTS = require('battlenet-ts'), // bleeding edge version :3
	Datastore = require('nedb');

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
    0: "admin",
    1: "officer",
    2: "officer",
    5: "grunt",
    6: "grunt",
    7: "social"
}


var bts = new BattlenetTS(JSON.parse(fs.readFileSync('./config.json', 'utf8')));

bts.on('teamspeak.connected', function(tsClient) {
	// The serverquery login is successful, commands can now be sent and received.
	console.log('Teamspeak Connected');
});

bts.on('express.started', function(port, protocol){
	// The webserver (expressjs) is started and reachable on the specified url
	console.log("Express running on port " + port);
});

bts.on('error', function(err, a, b, c) {
    console.log(err, a, b, c);
})

bts.on('teamspeak.client.connected', function(client) {
	var clid  = client.clid;
    var cluid = client.client_unique_identifier;

    db.findOne({ 'profile.cluid': cluid }, function(err, doc) {
        if(doc === null) {
            bts.send(client, 'Hello there, Please click [url=' + bts.getAuthUrl(clid, cluid) + ']here[/url] to authenticate');
        } else {
            doc.profile.clid = client.clid; // overwrite stored clid
            bts.verifyUser(doc.profile);
        }
    });
});

bts.on('battlenet.user.authenticated', function(profile) {
	db.insert({profile: profile});
});

bts.on('battlenet.user.verified', function(character) {

    db.findOne({"profile.cluid": character.profile.cluid}, function(err,doc) {
        // Make sure they are equal
        delete doc._id;
        doc.profile.clid = character.profile.clid;
        doc.level = character.level;
        doc.achievementPoints = character.achievementPoints;

        // Update stored clid.
        db.update({"profile.cluid": character.profile.cluid}, character, function(err, numAffected, affectedDocuments, upsert) {
            bts.getGuildMember(character, function(err, body) {
                console.log(body);
                if(tsRanks[body.rank] == 'social') {
                    bts.unsetGroup(character.profile.cluid, "grunt");
                } else {
                    bts.setGroup(character.profile.clid, tsRanks[body.rank]);
                }
            });

            // Only send the message if it's a new user.
            if(JSON.stringify(doc) != JSON.stringify(character)) {
                bts.send(character.profile, character.name + ", you are successfully verified.");
            }
            db.persistence.compactDatafile();
        });
    });
});

bts.on('battlenet.user.notverified', function(error) {
    db.remove({"profile.cluid": error.profile.cluid});
    bts.unsetGroup(error.profile.cluid, "grunt");
    bts.send(error.profile, "Your verification failed and your permissions, if any, have been revoked");
    setTimeout(() => {
        bts.send(error.profile, 'Hello there, Please click [url=' + bts.getAuthUrl(error.profile.clid, error.profile.cluid) + ']here[/url] to authenticate');
    }, 1000);
});

bts.connect();

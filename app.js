var express = require('express'),
    mongoose = require('mongoose'),
    body_parser = require('body-parser'),
    request = require('request');

var app = express();

app.use(express.static('./'));
app.use('/css', express.static('./css'));
app.use('/js', express.static('./js'));
app.use('/pictures', express.static('./pictures'));
app.set('views', './');

app.engine('html', require('ejs').renderFile);
app.set('view engine', 'html');
app.use(body_parser.json());
app.use(body_parser.urlencoded({extended : false}));

// Describes pages paths
app.get('/', function(req, res) {
    res.render('index.html');
});

app.get('/consent', function(req, res) {
    res.render('consent.html');
});

app.get('/experiment', function(req, res) {
    res.render('button.html');
});

var experiment_name = 'full_experiment';

// Database access
var experimentSchema = new mongoose.Schema({}, {collection: experiment_name, strict: false });
var Entry = mongoose.model('Entry', experimentSchema);

// Parameters access
var parametersSchema = new mongoose.Schema({}, {strict: false });
var Parameter = mongoose.model('Parameter', parametersSchema);

mongoose.connect(process.env.CONNECTION);
var db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error'));
db.once('open', function callback() {
    console.log('database opened');
});

// Loads experiment type from parameters
app.get('/get-parameter', function(req, res){
    Parameter.findOne({name: experiment_name}, function(err, data){
        var total_each = data['total_each'];
        var types_each = []
        for(const key in data){
            if(key.substr(0, 4) == 'type'){
                if(data[key] > total_each) types_each.push(total_each);
                else types_each.push(data[key]);
            }
        }

        var types_remain = 3*total_each;
        for(let i = 0; i < types_each.length; ++i){types_remain -= types_each[i];}

        if(types_remain == 0){
            var type = Math.floor(Math.random()*types_each.length)
            console.log("Running over experiment size, assigning random type " + type);
            res.json({type: type});
        }
        else{
            var probabilities = [0.0]
            for(let i = 1; i < types_each.length; ++i){probabilities.push(probabilities[i-1] + (total_each - types_each[i-1])/types_remain);}
            probabilities.shift();

            var random_val = Math.random();
            var type = 0;
            for(; type < types_each.length-1; ++type){
                if(random_val < probabilities[type]) break;
            }
            res.json({type: type});
        }
    });
});

app.post('/increment-type', function(req, res){
    let update_rule = {};
    update_rule['type_' + req.body.type] = 1;
    Parameter.findOneAndUpdate({name: experiment_name}, {$inc : update_rule}).exec();
    res.end();
});

// Posts experimental results
app.post('/experiment-data', function(req, res){
    Entry.create(req.body);    
    res.end();
});

// Updates experimental feedback
app.post('/experiment-feedback/:id', function(req, res){
    Entry.updateOne({subjectID: parseInt(req.params.id)},
        {$set: {feedback: req.body.feedback}},
        function(err, docs){
            if(err){console.log(err);}
            else{console.log("Added feedback:", docs);}
        });
    res.end();
});

// Checks captcha verification result
app.post('/submit-captcha',function(req,res){
    if(req.body['g-recaptcha-response'] === undefined || req.body['g-recaptcha-response'] === '' || req.body['g-recaptcha-response'] === null) {
        return res.json({"responseCode" : 1,"responseDesc" : "Please select captcha"});
    }
    var secretKey = process.env.RECAPTCHA_SECRET_KEY;
    var verificationUrl = "https://www.google.com/recaptcha/api/siteverify?secret=" + secretKey + "&response=" + req.body['g-recaptcha-response'] + "&remoteip=" + req.connection.remoteAddress;
    request(verificationUrl,function(error,response,body) {
        body = JSON.parse(body);
        if(body.success !== undefined && !body.success) {
            return res.json({"responseCode" : 1,"responseDesc" : "Failed captcha verification"});
        }
        res.json({"responseCode" : 0, "responseDesc" : "Success"});
    });
});

// --- START THE SERVER 
var server = app.listen(process.env.PORT, function(){
    console.log("Listening on port %d", server.address().port);
});
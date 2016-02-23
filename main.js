// Load NodeJS libraries.
var http = require('http');
var https = require('https');
var os = require('os');
var unirest = require('unirest');

// Load other libraries.
require('dotenv').load();

// Set up Express middleware.
var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var multer = require('multer');
var upload = multer();

// Set up port and public directories.
app.set('port', (process.env.PORT || 5000));
app.use(express.static(__dirname + '/public'));

// views is directory for all template files
app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');

// Set up parsing
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true}));

// Process taxa
function convert_names_into_list(req, res, next) {
    res.variables.taxon_names = (req.body.taxon_names || "").split(/\s*\n\s*/).join('\n');
    
    var names = res.variables.taxon_names.split(/\s*\n\s*/);
    names = names.filter(function(el) { return (!el.match(/^\s*$/)); });

    if(('names' in req.body) && (req.body.names.join('\n') == res.variables.taxon_names)) {
        // We already have 'names' coming from the author, ignore.     
        req.body.flag_check_all = 0;
    } else {
        // Pretend the user sent us a list of names: erase all (now redundant)
        // input parameters, reset taxon_names to names.join('\n')
        res.variables.taxon_names = (req.body.names || []).join('\n');
        req.body = {
            'names': names
        };
        req.body.flag_check_all = 1;
    }

    next();
}

function lookup_names_on_ott(req, res, next) {
    if('names' in req.body) {
        var index = 0;
        var names = [];

        req.body.names.forEach(function(verbatim) {
            index++;

            name = {
                verbatim: verbatim
            };

            if(('selected_' + index) in req.body) {
                name.checked = 1;
            } else {
                name.checked = req.body.flag_check_all;
            }

            if(('corrected_' + index) in req.body) {
                name.corrected = req.body['corrected_' + index];
            } else {
                name.corrected = name.verbatim;
            }

            // Reconcile the corrected name, but ONLY if the name is checked.
            if(name.checked) {
                unirest.get('https://api.opentreeoflife.org/v2/tnrs/match_names')
                    .end(function(response) {
                        result = JSON.parse(response.content);
                        name.mapped_to_ott_id = result;
                    });
            }

            names.push(name);
        });

        res.variables.names = names;
    }

    next();
}

// Display main page.
app.all('/', 
    function(req, res, next) { 
        console.log(req.body);
        res.variables = {
            'taxon_names': "",
            'names': []
        }; 
        next(); },
    convert_names_into_list,
    lookup_names_on_ott,
    function(req, res) {
        res.render('pages/index', res.variables);
    }
)

app.listen(app.get('port'), function() {
    console.log('Node app is running on port', app.get('port'));
});



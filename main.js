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
        // req.body.names and res.variables.taxon_names are in sync, leave it.
        req.body.flag_check_all = 0;
    } else {
        if(req.body.submit_btn == 'step1') {
            // If we're in step1, we should reset req.body.names so that it's in
            // sync with taxon_names.
            req.body.names = names;

            // Get rid of corrected names and everything else. 
            req.body = {
                'taxon_names': res.variables.taxon_names,
                'names': req.body.names
            };

        } else if(req.body.submit_btn == 'step2') {
            // If we're in step 2, we need to change the taxon_names to
            // bring it in sync with req.body.names
            res.variables.taxon_names = req.body.names.join('\n');

            // Don't need to reset!
        } else {
            // Eh? Default to taxon_names.
            req.body.names = names;
        }

        // TODO: do we still need this? Delete.
        req.body.flag_check_all = 1;
    }

    next();
}

function lookup_names_on_ott(req, res, next) {
    if(!('names' in req.body)) {
        // No names? Do nothing.
        next();
    } else {
        var index = 0;
        var names = [];
        var corrected_names = [];

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
 
            names.push(name);
            corrected_names.push(name.corrected);
        });

        res.variables.names = names;

        // Match all names on OTT.
        unirest.post('https://api.opentreeoflife.org/v2/tnrs/match_names')
            .header('Accept', 'application/json')
            .send({'names': corrected_names})
            .end(function(response) {
                r = response.body;

                if('results' in r) {
                    results = r.results;

                    results.forEach(function(result) {
                        id = result.id;

                        our_names = res.variables.names.filter(function(name) { return name.corrected == id; });
                        our_names.forEach(function(our_name) {
                            our_name.matched = result.matches[0];
                            our_name.matched.taxonomy = r.taxonomy;
                        });
                    });
                } 

                next();
            });
    }
}

function lookup_tree_on_ott(req, res, next) {
    if(!('ott_id' in req.body)) {
        next();
    } else {
        ott_ids = req.body.ott_id;

        // TODO: Only pick selected ott_ids.
        // console.log(ott_ids);

        unirest.post('https://api.opentreeoflife.org/v2/tree_of_life/induced_subtree')
            .send({'ott_ids': ott_ids})
            .end(function(response) {
                // console.log(response.body);
                res.variables.newick = response.body.newick;
                next();
            });
    }
}

// Display main page.
app.all('/', 
    function(req, res, next) { 
        // console.log(req.body);
        res.variables = {
            'taxon_names': "",
            'names': [],
            'newick': ""
        }; 
        next(); },
    convert_names_into_list,
    lookup_names_on_ott,
    lookup_tree_on_ott,
    function(req, res) {
        res.render('pages/index', res.variables);
    }
)

app.listen(app.get('port'), function() {
    console.log('Node app is running on port', app.get('port'));
});



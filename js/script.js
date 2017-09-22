document.addEventListener( "DOMContentLoaded", function() {
    const API_ROOT = "https://en.wikipedia.org/w/api.php",
          API_SUFFIX = "&format=json&callback=?&continue=",
          SUB_CATS = "Category:Pending AfC submissions";
    const NOTES = {
        "nc": "copyvio",
        "nu": "unsourced",
        "ni": "no-inline",
        "ns": "short",
        "nr": "resubmit",
        "no": "old",
        "nb": "blocked"
    };

    // Load checkboxes
    for( var note in NOTES) {
        document.getElementById( "filter" ).innerHTML += "<input type='checkbox' name='filter' value='" + note + "' id='filter-" + note + "' /><label for='filter-" + note + "'>" + NOTES[ note ] + "</label>";
    }

    function load() {
        var table = document.getElementById( "result" );

        // Clear out table
        while ( table.firstChild ) {
            table.removeChild( table.firstChild );
        }

        // Clear error
        document.getElementById( "error" ).innerHTML = "";

        // Loading image
        document.getElementById( "loading" ).innerHTML = "<img src='images/loading.gif' /><br />Loading...";

        // Get which checkboxes are checked
        var enabledFiltersElements = document.querySelectorAll('input[name=filter]:checked');
        var enabledFilters = [];
        for(var i = 0; i < enabledFiltersElements.length; i++ ) {
            enabledFilters.push( enabledFiltersElements[ i ].value );
        }

        loadJsonp( API_ROOT + "?action=query&prop=revisions&titles=Template:AFC_statistics&rvprop=content|timestamp" + API_SUFFIX )
            .then( function ( data ) {

                // Sanity check on the query results
                if ( !data.query || !data.query.pages ) {
                    document.getElementById( "error" ).innerHTML = "Error loading recent changes!";
                    return;
                }

                // Initial parsing of the query results
                var pageId = Object.keys( data.query.pages );
                var revision = data.query.pages[ pageId ].revisions[ 0 ];
                var content = revision[ "*" ];

                // Only parse the first section (the pending
                // submissions)
                content = content.substring(0, content.indexOf("AFC statistics/footer"));

                // Each line of the wikitext contains one submissions'
                // info
                content = content.split( "\n" );

                // Show metadata about how recent the data is
                document.getElementById( "metadata" ).innerHTML =
                    "Results as of " + revision.timestamp + " (" +
                    timeSince( parseIsoDatetime( revision.timestamp ) ) +
                    " ago):";

                // Formatting function, used by the HTML-maker loop
                var normalizeTitle = function( title ) { return title.replace( " ", "-" ); };

                // Hide the "loading" image, because we're about to
                // display the data
                document.getElementById( "loading" ).innerHTML = "";

                // This loop reads the API results (stored in the
                // content[] array) and formats the list of
                // submissions into a table.
                var numEnabledFilters = enabledFilters.length;
                var result = "<th>Name</th><th>Notes</th><th>Status</th>";
                var allRevids = [];
                var allTitles = [];
                var title, filtersHere, revid;
                for( var i = 0; i < content.length; i++ ) {
                    if( !content[ i ].startsWith( "{{#invoke" ) ) continue;
                    filtersHere = Object.keys( NOTES ).filter( function ( filter ) {
                        return content[ i ].indexOf( "|" + filter ) > 0;
                    } );
                    enabledFiltersHere = enabledFilters.filter( function ( f ) { return filtersHere.indexOf( f ) > -1; } );
                    if( enabledFiltersHere.length === numEnabledFilters ) {
                        result += "<tr>";
                        title = /\|t=(.+?)\|/.exec( content[ i ] )[1];
                        allTitles.push( title );
                        result += "<td>" + wikilink( title ) + "</td>";
                        result += "<td>" + filtersHere.map( function ( f ) { return NOTES[ f ]; } ).join( ", " ) + "</td>";
                        revid = /\|si=(.+?)\|/.exec( content[ i ])[1];
                        result += "<td id='status-" + normalizeTitle( title ) + "'>Unknown</td>";
                        allRevids.push( revid );
                        result += "</tr>";
                    }
                }

                document.getElementById( "result" ).innerHTML = result;

                // We want the pending/reviewed status of each
                // submission, so we divide the submissions into blocks
                // of 50, then fetch their categories (w/ an intelligent
                // use of clcategories so we don't fetch extra ones),
                // then display them using the submission-specific
                // element ids that we already put in the table cells
                var revidQueryParam, page, ourTitles;
                for( i = 0; i < allRevids.length; i += 50 ) {
                    revidQueryParam = allRevids.slice( i, i + 50 ).map( fixedEncodeURIComponent ).join( "|" );
                    ( function ( ourTitles ) {
                        loadJsonp( API_ROOT + "?action=query&revids=" +
                                revidQueryParam + "&prop=categories&clcategories="+
                                SUB_CATS + API_SUFFIX ).then( function ( data ) {
                            if ( !data.query || !data.query.pages ) {
                                return;
                            }
                            for( var pageid in data.query.pages ) {
                                page = data.query.pages[ pageid ];
                                var pending = page.hasOwnProperty( "categories" );
                                var elId = "status-" + normalizeTitle( page.title );
                                var el = document.getElementById( elId );
                                if( el ) {
                                    ourTitles.splice( ourTitles.indexOf( page.title ), 1);
                                    el.innerHTML = pending ? "Pending" : "Reviewed";
                                    el.className += pending ? "pending" : "";
                                }
                            }
                        } );
                    } )( allTitles.slice( i, i + 50 ) );
                }
            } ); // end loadJsonp
    }

    load();


    var filterRadioBtns = document.getElementsByName( "filter" );
    for(var i = 0; i < filterRadioBtns.length; i++) {
        filterRadioBtns[i].addEventListener( 'click', load );
    }

    // Utility functions
    // -------------------------------------------

    // Adapted from https://gist.github.com/gf3/132080/110d1b68d7328d7bfe7e36617f7df85679a08968
    var jsonpUnique = 0;
    function loadJsonp(url) {
        var unique = jsonpUnique++;
        return new Promise( function ( resolve, reject ) {
            var name = "_jsonp_" + unique;
            if (url.match(/\?/)) url += "&callback="+name;
            else url += "?callback="+name;
            var script = document.createElement('script');
            script.type = 'text/javascript';
            script.src = url;
            script.onerror = function() { reject(); };
            window[name] = function(data) {
                resolve(data);
                document.getElementsByTagName('head')[0].removeChild(script);
                script = null;
                delete window[name];
            };
            document.getElementsByTagName('head')[0].appendChild(script);
        } );
    }

    // From https://stackoverflow.com/a/26434619/1757964
    function parseIsoDatetime(dtstr) {
        var dt = dtstr.split(/[: T-]/).map(parseFloat);
        return new Date(dt[0], dt[1] - 1, dt[2], dt[3] || 0, dt[4] || 0, dt[5] || 0, 0);
    }

    // Adapted from https://stackoverflow.com/a/3177838/1757964
    function timeSince(date) {
        var seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);

        var interval = Math.floor(seconds / 86400);
        if (interval > 1) {
            return interval + " days";
        }
        interval = Math.floor(seconds / 3600);
        if (interval > 1) {
            return interval + " hours";
        }
        interval = Math.floor(seconds / 60);
        if (interval > 1) {
            return interval + " minutes";
        }
        return Math.floor(seconds) + " seconds";
    }

    // Makes a wikilink
    function wikilink(title) {
        return "<a href='https://en.wikipedia.org/wiki/" + fixedEncodeURIComponent( title ) + "'>" + title + "</a>";
    }

    // From https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/encodeURIComponent
    function fixedEncodeURIComponent(str) {
        return encodeURIComponent(str).replace(/[!'()*]/g, function(c) {
            return '%' + c.charCodeAt(0).toString(16);
        } );
    }
} );

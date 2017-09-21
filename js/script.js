document.addEventListener( "DOMContentLoaded", function() {
    const API_ROOT = "https://en.wikipedia.org/w/api.php",
          API_SUFFIX = "&format=json&callback=?&continue=";
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
                if ( !data.query || !data.query.pages ) {
                    document.getElementById( "error" ).innerHTML = "Error loading recent changes!";
                    return;
                }

                document.getElementById( "loading" ).innerHTML = "";

                var pageId = Object.keys( data.query.pages );
                var revision = data.query.pages[ pageId ].revisions[ 0 ];

                var result = "<th>Name</th><th>Notes</th>";
                document.getElementById( "metadata" ).innerHTML =
                    "Results as of " + revision.timestamp + " (" +
                    timeSince( parseIsoDatetime( revision.timestamp ) ) +
                    " ago):";
                var content = revision[ "*" ];
                content = content.split( "\n" );

                var result = "";
                var numEnabledFilters = enabledFilters.length;
                var title, filtersHere;
                for( var i = 0; i < content.length; i++ ) {
                    if( !content[ i ].startsWith( "{{#invoke" ) ) continue;
                    filtersHere = Object.keys( NOTES ).filter( function ( filter ) {
                        return content[ i ].indexOf( "|" + filter ) > 0;
                    } );
                    enabledFiltersHere = enabledFilters.filter( function ( f ) { return filtersHere.indexOf( f ) > -1; } );
                    if( enabledFiltersHere.length === numEnabledFilters ) {
                        result += "<tr>";
                        title = /\|t=(.+?)\|/.exec( content[ i ] )[1];
                        result += "<td>" + wikilink(title) + "</td>";
                        result += "<td>" + filtersHere.map( function ( f ) { return NOTES[ f ]; } ).join( ", " ) + "</td>";
                        result += "</tr>";
                    }
                }

                document.getElementById( "result" ).innerHTML = result;
                return;

                // Get list of users
                var users = uniq( data.query.recentchanges.map( function ( entry ) { return entry.user; } ) );

                // Filter on blacklist
                users = users.filter( function ( user ) {

                    // Is user not on blacklist?
                    return eval(atob("dXNlciAgICAgICAgICAhPT0gIkRlbHRhUXVhZCI="));
                } );

                var userInfoPromises = users.map( function ( user ) {
                    return loadJsonp( API_ROOT + "?action=query&list=users&usprop=editcount|groups&ususers=" + encodeURIComponent( user ) + API_SUFFIX );
                } ).map( function( promise ) {

                    // If a call fails, we really don't care
                    return new Promise( function ( resolve ) {
                        promise
                            .then( function ( x ) { resolve( x ); } )
                            .catch( function ( x ) { resolve( null ); } );
                    } );
                } );
                Promise.all( userInfoPromises ).then( function( results ) {
                    var filteredUsers = [];
                    var requiredGroup = document.querySelector( 'input[name="filter"]:checked' ).value;
                    results.forEach( function ( result ) {
                        if( result === null ) return;
                        var user = result.query.users[0],
                            highEditCount = user.editcount > EDIT_COUNT_THRESHOLD,
                            notBot = user.groups.indexOf( "bot" ) === -1,
                            hasGroup = user.groups.indexOf( requiredGroup ) !== -1;
                        if ( highEditCount && notBot && hasGroup ) {
                            filteredUsers.push( result.query.users[0].name );
                        }
                    } );

                    if(filteredUsers.length) {
                        var newRow = document.createElement( "tr" );
                        newRow.innerHTML = "<th>User</th>";
                        table.appendChild( newRow );
                        filteredUsers.forEach( function ( user ) {
                            newRow = document.createElement( "tr" );
                            newRow.innerHTML = makeUserCell( user );
                            table.appendChild( newRow );
                        } );
                    } else {
                        document.getElementById( "error" ).innerHTML = "No user in the <tt>" + requiredGroup + "</tt> group has edited very recently.";
                    }
                    for(var i = 0; i < filterRadioBtns.length; i++) {
                        filterRadioBtns[i].disabled = "";
                    }
                } );
            } ); // end loadJsonp
    }

    load();


    var filterRadioBtns = document.getElementsByName( "filter" );
    for(var i = 0; i < filterRadioBtns.length; i++) {
        filterRadioBtns[i].addEventListener( 'click', load );
    }

    /**
     * Makes a <td> with all sorts of fun links.
     */
    function makeUserCell ( username ) {
        return "<td><a href='https://en.wikipedia.org/wiki/User:" + username + "' title='Wikipedia user page of " + username + "'>" + username + "</a> (<a href='https://en.wikipedia.org/wiki/User talk:" + username + "' title='Wikipedia user talk page of " + username + "'>talk</a> &middot; <a href='https://en.wikipedia.org/wiki/Special:Contributions/" + username + "' title='Wikipedia contributions of " + username + "'>contribs</a>)</td>";
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

    // From http://stackoverflow.com/a/9229821/1757964
    function uniq(a) {
        var seen = {};
        var out = [];
        var len = a.length;
        var j = 0;
        for(var i = 0; i < len; i++) {
            var item = a[i];
            if(seen[item] !== 1) {
                seen[item] = 1;
                out[j++] = item;
            }
        }
        return out;
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
        return "<a href='https://en.wikipedia.org/wiki/" + title + "'>" + title + "</a>";
    }
} );

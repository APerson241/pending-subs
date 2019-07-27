document.addEventListener( "DOMContentLoaded", function() {
    const API_ROOT = "https://en.wikipedia.org/w/api.php",
          API_SUFFIX = "&format=json&callback=?&continue=",
          SUB_CATS = "Category:Pending AfC submissions",
          STEP_LENGTH = 10;
    const NOTES = ["copyvio", "no-inline", "unsourced", "short", "resubmit", "veryold", "userspace", "no-projs"];

    // State variable for JSONP calls
    var jsonpUnique = 0;

    // Based on checkboxes and project filter, updates visibility
    function updateFiltered() {
        // Get which checkboxes are checked
        var enabledFiltersElements = document.querySelectorAll('input[name=filter]:checked');
        var enabledFilters = [];
        for(var i = 0; i < enabledFiltersElements.length; i++ ) {
            if( enabledFiltersElements[ i ].value === "no-projs" ) continue;
            enabledFilters.push( enabledFiltersElements[ i ].value );
        }

        // And which projects are required
        var projs = multipleCancelButton.getValue( /* valueOnly */ true );

        var isNoProjsFilterOn = document.querySelector( "input[value='no-projs']" ).checked;

        var rows = document.querySelectorAll( "#result tr" );
        var notes, currProjs, passesFilter;
        for( i = 1; i < rows.length; i++ ) {
            notes = rows[i].children[1].innerHTML;
            passesFilter = enabledFilters.every( function ( filter ) {
                return notes.indexOf( filter ) >= 0;
            } );
            currProjs = rows[i].children[2].getAttribute( "value" );
            passesFilter &= !isNoProjsFilterOn || !currProjs;
            passesFilter &= projs.every( function ( eachProj ) {
                return currProjs.indexOf( eachProj ) >= 0;
            } );
            rows[i].style.display = passesFilter ? "" : "none";
        }

        // Update filtering statistics
        // The -1 is for the row with the headers
        var numShownDrafts = document.querySelectorAll( 'tr:not([style*="display: none"])' ).length - 1;
        var filterStats = "There are " + window.pendingSubsDraftCount + " submissions";
        if( numShownDrafts === window.pendingSubsDraftCount ) {
            filterStats += ".";
        } else {
            if( numShownDrafts === 0 ) {
                filterStats += "; the selected filters don't match any of them.";
            } else {
                filterStats += "; " + numShownDrafts + " match" + ( numShownDrafts === 1 ? "es" : "" ) + " the selected filters.";
            }
        }

        document.getElementById( "filter-stats" ).textContent = filterStats;
    }

    // Loads "Pending" or "Reviewed" status
    function loadPending() {
        var table = document.getElementById( "result" );

        // Clear error
        document.getElementById( "error" ).innerHTML = "";

        // We want the pending/reviewed status of each
        // submission, so we divide the submissions into blocks
        // of 50, then fetch their categories (w/ an intelligent
        // use of clcategories so we don't fetch extra ones),
        // then display them using the submission-specific
        // element ids that we already put in the table cells
        var linksNodeList = document.querySelectorAll( "#result tr td:first-child a" );
        var links = [];
        for( i = 0; i < linksNodeList.length; i++ ) {
            links.push( linksNodeList[ i ] );
        }
        var revidQueryParam, page, ourTitles;
        for( i = 0; i < links.length; i += STEP_LENGTH ) {
            titles = links.slice( i, i + STEP_LENGTH )
                .map( function ( link ) { return link.href; } )
                .map( function ( href ) { return /https:\/\/en.wikipedia.org\/wiki\/(.+)/.exec( href )[ 1 ]; } )
                .map( function ( title ) { return title.replace( "&", "%26" ).replace( "+", "%2B" ); } );
            revidQueryParam = titles
                .join( "|" );
            ( function ( ourTitles ) {
                loadJsonp( API_ROOT + "?action=query&titles=" +
                        revidQueryParam + "&prop=categories&clcategories=Category:Pending AfC submissions" + API_SUFFIX ).then( function ( data ) {
                    if ( !data.query || !data.query.pages ) {
                        return;
                    }
                    for( var pageid in data.query.pages ) {
                        page = data.query.pages[ pageid ];
                        var pending = page.hasOwnProperty( "categories" );
                        //console.log(pending + JSON.stringify(page));
                        var elId = "status-" +
                            page.title.replace( / /g, "-" )
                            .replace( /'/g, "-" ).replace( /\+/g, "-" );
                        var el = document.getElementById( elId );
                        if( el ) {
                            ourTitles.splice( ourTitles.indexOf( page.title ), 1);
                            el.innerHTML = pending ? "Pending" : "Reviewed";
                            el.className += pending ? "pending" : "";
                        } else {
                            console.log( "No matching element for element " + elId );
                        }
                    }
                } );
            } )( titles );
        }
    }

    // Initialize wikiproject filter
    var multipleCancelButton = new Choices( '#proj-positive-filter', {
        removeItemButton: true,
    } );

    loadPending();
    updateFiltered();

    var filterRadioBtns = document.getElementsByName( "filter" );
    for(var i = 0; i < filterRadioBtns.length; i++) {
        filterRadioBtns[i].addEventListener( 'click', updateFiltered );
    }

    multipleCancelButton.passedElement.addEventListener( "change", function ( value ) {
        console.log( multipleCancelButton.getValue( /* valueOnly */ true ) );
        updateFiltered();
    } );

    // Utility functions
    // -------------------------------------------

    // Adapted from https://gist.github.com/gf3/132080/110d1b68d7328d7bfe7e36617f7df85679a08968
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

    // From https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/encodeURIComponent
    function fixedEncodeURIComponent(str) {
        return encodeURIComponent(str).replace(/[!'()*]/g, function(c) {
            return '%' + c.charCodeAt(0).toString(16);
        } );
    }
} );

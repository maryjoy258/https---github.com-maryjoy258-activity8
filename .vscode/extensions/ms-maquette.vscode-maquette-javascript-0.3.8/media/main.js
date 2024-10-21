(function () {
    const vscode = acquireVsCodeApi();

    const oldState = vscode.getState();

    const spotlightPlaceholder = document.getElementById('spotlightPlaceholder');
    const recentPlaceholder = document.getElementById('recentPlaceholder');

    this.testFunction = function( aaa ) {
        vscode.postMessage({
            command: 'messageFromWebview',
            text: 'TestFunction with argument' + aaa
        });
    };

    // Handle messages sent from the extension to the webview
    window.addEventListener('message', event => {
        const message = event.data; // The json data that the extension sent
        switch (message.command) {
            case 'messageFromExtension':

                break;
            case 'updateSpotlights':

                var data = JSON.parse( message.data );
                               
                var sString = "<ul>";
                for( var i = 0; i < data.length ; i++ ) {
                    sString = sString + '<li><a href="command:vscode-maquette-app.loadSpotlight_' 
                        + data[i].index + '">' + data[i].name + '</a></li>\n';
                }
                          
                sString += "</ul>";
                spotlightPlaceholder.innerHTML = sString;
                break;
            case 'updateRecent': {
                var data2 = JSON.parse( message.data );
                               
                var sString2 = "<ul>";
                for( var i = 0; i < data2.length ; i++ ) {
                     sString2 = sString2 + '<li><a href="command:vscode-maquette-app.loadRecent_' 
                         + data2[i].index + '">' + data2[i].name + '</a></li>\n';
                }

                sString2 += "</ul>";
                recentPlaceholder.innerHTML = sString2;
                break;
            }
            
        }
    });
}());
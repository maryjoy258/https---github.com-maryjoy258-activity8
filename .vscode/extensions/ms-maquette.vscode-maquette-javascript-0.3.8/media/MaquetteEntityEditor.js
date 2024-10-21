(function () {

	const vscode = acquireVsCodeApi();

	const placeholderContainer = /** @type {HTMLElement} */ (document.querySelector('.contentPlaceholder'));

	function updateContent(/** @type {string} */ text) {
		placeholderContainer.innerText = text;
	}

	const refreshButtonContainer = document.querySelector('.refresh-button');
	refreshButtonContainer.querySelector('button').addEventListener('click', () => {
		vscode.postMessage({
			type: 'refresh'
		});
	});

	const saveButtonContainer = document.querySelector('.save-button');
	saveButtonContainer.querySelector('button').addEventListener('click', () => {
		vscode.postMessage({
			type: 'save'
		});
	});

	window.addEventListener('message', event => {
		const message = event.data; // The json data that the extension sent
		switch (message.type) {
			case 'update':
				const text = message.text;

				// Update our webview's content
				updateContent(text);

				// Then persist state information.
				// This state is returned in the call to `vscode.getState` below when a webview is reloaded.
				vscode.setState({ text });

				return;
		}
	});

	// Webviews are normally torn down when not visible and re-created when they become visible again.
	// State lets us save information across these re-loads
	const state = vscode.getState();
	if (state) {
		updateContent(state.text);
	}
}());
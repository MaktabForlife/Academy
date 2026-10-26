/* Hide the stock toolbar until the embedded Academy controls are ready. */
if(new URLSearchParams(location.search).get('academy')==='1')document.documentElement.classList.add('academy-reader-loading');

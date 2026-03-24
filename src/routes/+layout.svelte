<script lang="ts">
	let { children } = $props();
</script>

<svelte:head>
	<title>HTML to PDF - Convert HTML to PDF Documents</title>
	<meta name="description" content="Convert HTML to beautifully formatted PDF documents. Paste code or upload an HTML file and download the result instantly. Built by polyym." />
	<meta name="author" content="polyym" />
	<meta property="og:title" content="HTML to PDF Converter" />
	<meta property="og:description" content="Convert HTML to beautifully formatted PDF documents. Paste code or upload a file and download instantly." />
	<meta property="og:type" content="website" />
	<meta name="twitter:card" content="summary" />
	<meta name="twitter:title" content="HTML to PDF Converter" />
	<meta name="twitter:description" content="Convert HTML to PDF documents instantly. Paste code or upload a file." />
</svelte:head>

{@render children()}

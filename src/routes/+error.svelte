<script lang="ts">
	import { page } from '$app/state';
</script>

<div class="error-page">
	<div class="error-icon">
		<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
			<circle cx="12" cy="12" r="10" />
			<line x1="15" y1="9" x2="9" y2="15" />
			<line x1="9" y1="9" x2="15" y2="15" />
		</svg>
	</div>
	<h1>{page.status}</h1>
	<p>{page.error?.message || 'Something went wrong'}</p>
	<a href="/">Go home</a>
</div>

<style>
	.error-page {
		min-height: 100vh;
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 12px;
		padding: 20px;
		background: #09090b;
		color: #fafafa;
		font-family: 'Inter', -apple-system, sans-serif;
		-webkit-font-smoothing: antialiased;
		text-align: center;
	}

	.error-icon {
		color: #ef4444;
		margin-bottom: 4px;
	}

	h1 {
		font-size: 48px;
		font-weight: 600;
		letter-spacing: -1px;
		margin: 0;
	}

	p {
		font-size: 15px;
		color: #71717a;
		margin: 0;
	}

	a {
		font-size: 14px;
		font-weight: 500;
		color: #3b82f6;
		text-decoration: underline;
		text-underline-offset: 2px;
		margin-top: 8px;
		transition: color 0.15s ease;
	}

	a:hover {
		color: #fafafa;
	}
</style>

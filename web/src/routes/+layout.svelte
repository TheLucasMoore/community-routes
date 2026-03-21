<script>
	let { children } = $props();
</script>

<svelte:head>
	<title>Community Routes — Bikepacking Route Builder</title>
	<meta name="description" content="Community-driven bikepacking route builder" />
</svelte:head>

<div class="app-shell">
	<header class="app-header">
		<div class="app-header-inner">
			<span class="app-logo">🚵</span>
			<h1 class="app-title">Community Routes</h1>
			<span class="app-subtitle">Bikepacking Route Builder</span>
		</div>
	</header>

	<div class="app-body">
		{@render children()}
	</div>
</div>

<style>
	:global(*, *::before, *::after) {
		box-sizing: border-box;
	}

	:global(body) {
		margin: 0;
		padding: 0;
		font-family:
			-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, sans-serif;
		background: #f9fafb;
		color: #111827;
	}

	:global(html, body) {
		height: 100%;
	}

	.app-shell {
		display: flex;
		flex-direction: column;
		height: 100vh;
		overflow: hidden;
	}

	.app-header {
		background: #1e293b;
		color: white;
		padding: 0 20px;
		height: 52px;
		flex-shrink: 0;
		display: flex;
		align-items: center;
	}

	.app-header-inner {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.app-logo {
		font-size: 1.3rem;
	}

	.app-title {
		margin: 0;
		font-size: 1.05rem;
		font-weight: 700;
		letter-spacing: -0.01em;
	}

	.app-subtitle {
		font-size: 0.8rem;
		color: #94a3b8;
		margin-left: 4px;
	}

	.app-body {
		flex: 1;
		overflow: hidden;
		display: flex;
	}
</style>

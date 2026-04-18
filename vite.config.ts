import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig(({ command, mode }) => {
	if (command === 'build' && mode === 'production' && !process.env.PUBLIC_API_URL) {
		throw new Error(
			'PUBLIC_API_URL must be set for production builds. See netlify.toml for setup instructions.'
		);
	}
	return {
		plugins: [sveltekit()]
	};
});

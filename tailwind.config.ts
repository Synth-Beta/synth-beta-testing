import type { Config } from "tailwindcss";

export default {
	darkMode: ["class"],
	content: [
		"./pages/**/*.{ts,tsx}",
		"./components/**/*.{ts,tsx}",
		"./app/**/*.{ts,tsx}",
		"./src/**/*.{ts,tsx}",
	],
	prefix: "",
	theme: {
		container: {
			center: true,
			padding: '2rem',
			screens: {
				'2xl': '1400px'
			}
		},
		extend: {
			// Theme-aware per utility (vars in src/styles/tokens.css): bg-white is a surface, text-white is ink on pink.
			backgroundColor: {
				white: 'rgb(var(--tw-bg-white) / <alpha-value>)',
				gray: {
					50: 'rgb(var(--tw-bg-gray-50) / <alpha-value>)',
					100: 'rgb(var(--tw-bg-gray-100) / <alpha-value>)',
					200: 'rgb(var(--tw-bg-gray-200) / <alpha-value>)',
					300: 'rgb(var(--tw-bg-gray-300) / <alpha-value>)',
					400: 'rgb(var(--tw-bg-gray-400) / <alpha-value>)',
					500: 'rgb(var(--tw-bg-gray-500) / <alpha-value>)',
					600: 'rgb(var(--tw-bg-gray-600) / <alpha-value>)',
					700: 'rgb(var(--tw-bg-gray-700) / <alpha-value>)',
					800: 'rgb(var(--tw-bg-gray-800) / <alpha-value>)',
					900: 'rgb(var(--tw-bg-gray-900) / <alpha-value>)',
					950: 'rgb(var(--tw-bg-gray-950) / <alpha-value>)'
				},
				neutral: {
					50: 'rgb(var(--tw-bg-neutral-50) / <alpha-value>)',
					100: 'rgb(var(--tw-bg-neutral-100) / <alpha-value>)',
					200: 'rgb(var(--tw-bg-neutral-200) / <alpha-value>)',
					300: 'rgb(var(--tw-bg-neutral-300) / <alpha-value>)',
					400: 'rgb(var(--tw-bg-neutral-400) / <alpha-value>)',
					500: 'rgb(var(--tw-bg-neutral-500) / <alpha-value>)',
					600: 'rgb(var(--tw-bg-neutral-600) / <alpha-value>)',
					700: 'rgb(var(--tw-bg-neutral-700) / <alpha-value>)',
					800: 'rgb(var(--tw-bg-neutral-800) / <alpha-value>)',
					900: 'rgb(var(--tw-bg-neutral-900) / <alpha-value>)',
					950: 'rgb(var(--tw-bg-neutral-950) / <alpha-value>)'
				}
			},
			textColor: {
				black: 'rgb(var(--tw-text-black) / <alpha-value>)',
				gray: {
					50: 'rgb(var(--tw-text-gray-50) / <alpha-value>)',
					100: 'rgb(var(--tw-text-gray-100) / <alpha-value>)',
					200: 'rgb(var(--tw-text-gray-200) / <alpha-value>)',
					300: 'rgb(var(--tw-text-gray-300) / <alpha-value>)',
					400: 'rgb(var(--tw-text-gray-400) / <alpha-value>)',
					500: 'rgb(var(--tw-text-gray-500) / <alpha-value>)',
					600: 'rgb(var(--tw-text-gray-600) / <alpha-value>)',
					700: 'rgb(var(--tw-text-gray-700) / <alpha-value>)',
					800: 'rgb(var(--tw-text-gray-800) / <alpha-value>)',
					900: 'rgb(var(--tw-text-gray-900) / <alpha-value>)',
					950: 'rgb(var(--tw-text-gray-950) / <alpha-value>)'
				},
				neutral: {
					50: 'rgb(var(--tw-text-neutral-50) / <alpha-value>)',
					100: 'rgb(var(--tw-text-neutral-100) / <alpha-value>)',
					200: 'rgb(var(--tw-text-neutral-200) / <alpha-value>)',
					300: 'rgb(var(--tw-text-neutral-300) / <alpha-value>)',
					400: 'rgb(var(--tw-text-neutral-400) / <alpha-value>)',
					500: 'rgb(var(--tw-text-neutral-500) / <alpha-value>)',
					600: 'rgb(var(--tw-text-neutral-600) / <alpha-value>)',
					700: 'rgb(var(--tw-text-neutral-700) / <alpha-value>)',
					800: 'rgb(var(--tw-text-neutral-800) / <alpha-value>)',
					900: 'rgb(var(--tw-text-neutral-900) / <alpha-value>)',
					950: 'rgb(var(--tw-text-neutral-950) / <alpha-value>)'
				}
			},
			borderColor: {
				white: 'rgb(var(--tw-line-white) / <alpha-value>)',
				black: 'rgb(var(--tw-line-black) / <alpha-value>)',
				gray: {
					50: 'rgb(var(--tw-line-gray-50) / <alpha-value>)',
					100: 'rgb(var(--tw-line-gray-100) / <alpha-value>)',
					200: 'rgb(var(--tw-line-gray-200) / <alpha-value>)',
					300: 'rgb(var(--tw-line-gray-300) / <alpha-value>)',
					400: 'rgb(var(--tw-line-gray-400) / <alpha-value>)',
					500: 'rgb(var(--tw-line-gray-500) / <alpha-value>)',
					600: 'rgb(var(--tw-line-gray-600) / <alpha-value>)',
					700: 'rgb(var(--tw-line-gray-700) / <alpha-value>)',
					800: 'rgb(var(--tw-line-gray-800) / <alpha-value>)',
					900: 'rgb(var(--tw-line-gray-900) / <alpha-value>)',
					950: 'rgb(var(--tw-line-gray-950) / <alpha-value>)'
				},
				neutral: {
					50: 'rgb(var(--tw-line-neutral-50) / <alpha-value>)',
					100: 'rgb(var(--tw-line-neutral-100) / <alpha-value>)',
					200: 'rgb(var(--tw-line-neutral-200) / <alpha-value>)',
					300: 'rgb(var(--tw-line-neutral-300) / <alpha-value>)',
					400: 'rgb(var(--tw-line-neutral-400) / <alpha-value>)',
					500: 'rgb(var(--tw-line-neutral-500) / <alpha-value>)',
					600: 'rgb(var(--tw-line-neutral-600) / <alpha-value>)',
					700: 'rgb(var(--tw-line-neutral-700) / <alpha-value>)',
					800: 'rgb(var(--tw-line-neutral-800) / <alpha-value>)',
					900: 'rgb(var(--tw-line-neutral-900) / <alpha-value>)',
					950: 'rgb(var(--tw-line-neutral-950) / <alpha-value>)'
				}
			},
			divideColor: {
				white: 'rgb(var(--tw-line-white) / <alpha-value>)',
				black: 'rgb(var(--tw-line-black) / <alpha-value>)',
				gray: {
					50: 'rgb(var(--tw-line-gray-50) / <alpha-value>)',
					100: 'rgb(var(--tw-line-gray-100) / <alpha-value>)',
					200: 'rgb(var(--tw-line-gray-200) / <alpha-value>)',
					300: 'rgb(var(--tw-line-gray-300) / <alpha-value>)',
					400: 'rgb(var(--tw-line-gray-400) / <alpha-value>)',
					500: 'rgb(var(--tw-line-gray-500) / <alpha-value>)',
					600: 'rgb(var(--tw-line-gray-600) / <alpha-value>)',
					700: 'rgb(var(--tw-line-gray-700) / <alpha-value>)',
					800: 'rgb(var(--tw-line-gray-800) / <alpha-value>)',
					900: 'rgb(var(--tw-line-gray-900) / <alpha-value>)',
					950: 'rgb(var(--tw-line-gray-950) / <alpha-value>)'
				},
				neutral: {
					50: 'rgb(var(--tw-line-neutral-50) / <alpha-value>)',
					100: 'rgb(var(--tw-line-neutral-100) / <alpha-value>)',
					200: 'rgb(var(--tw-line-neutral-200) / <alpha-value>)',
					300: 'rgb(var(--tw-line-neutral-300) / <alpha-value>)',
					400: 'rgb(var(--tw-line-neutral-400) / <alpha-value>)',
					500: 'rgb(var(--tw-line-neutral-500) / <alpha-value>)',
					600: 'rgb(var(--tw-line-neutral-600) / <alpha-value>)',
					700: 'rgb(var(--tw-line-neutral-700) / <alpha-value>)',
					800: 'rgb(var(--tw-line-neutral-800) / <alpha-value>)',
					900: 'rgb(var(--tw-line-neutral-900) / <alpha-value>)',
					950: 'rgb(var(--tw-line-neutral-950) / <alpha-value>)'
				}
			},
			ringColor: {
				white: 'rgb(var(--tw-line-white) / <alpha-value>)',
				black: 'rgb(var(--tw-line-black) / <alpha-value>)',
				gray: {
					50: 'rgb(var(--tw-line-gray-50) / <alpha-value>)',
					100: 'rgb(var(--tw-line-gray-100) / <alpha-value>)',
					200: 'rgb(var(--tw-line-gray-200) / <alpha-value>)',
					300: 'rgb(var(--tw-line-gray-300) / <alpha-value>)',
					400: 'rgb(var(--tw-line-gray-400) / <alpha-value>)',
					500: 'rgb(var(--tw-line-gray-500) / <alpha-value>)',
					600: 'rgb(var(--tw-line-gray-600) / <alpha-value>)',
					700: 'rgb(var(--tw-line-gray-700) / <alpha-value>)',
					800: 'rgb(var(--tw-line-gray-800) / <alpha-value>)',
					900: 'rgb(var(--tw-line-gray-900) / <alpha-value>)',
					950: 'rgb(var(--tw-line-gray-950) / <alpha-value>)'
				},
				neutral: {
					50: 'rgb(var(--tw-line-neutral-50) / <alpha-value>)',
					100: 'rgb(var(--tw-line-neutral-100) / <alpha-value>)',
					200: 'rgb(var(--tw-line-neutral-200) / <alpha-value>)',
					300: 'rgb(var(--tw-line-neutral-300) / <alpha-value>)',
					400: 'rgb(var(--tw-line-neutral-400) / <alpha-value>)',
					500: 'rgb(var(--tw-line-neutral-500) / <alpha-value>)',
					600: 'rgb(var(--tw-line-neutral-600) / <alpha-value>)',
					700: 'rgb(var(--tw-line-neutral-700) / <alpha-value>)',
					800: 'rgb(var(--tw-line-neutral-800) / <alpha-value>)',
					900: 'rgb(var(--tw-line-neutral-900) / <alpha-value>)',
					950: 'rgb(var(--tw-line-neutral-950) / <alpha-value>)'
				}
			},
			placeholderColor: {
				gray: {
					50: 'rgb(var(--tw-text-gray-50) / <alpha-value>)',
					100: 'rgb(var(--tw-text-gray-100) / <alpha-value>)',
					200: 'rgb(var(--tw-text-gray-200) / <alpha-value>)',
					300: 'rgb(var(--tw-text-gray-300) / <alpha-value>)',
					400: 'rgb(var(--tw-text-gray-400) / <alpha-value>)',
					500: 'rgb(var(--tw-text-gray-500) / <alpha-value>)',
					600: 'rgb(var(--tw-text-gray-600) / <alpha-value>)',
					700: 'rgb(var(--tw-text-gray-700) / <alpha-value>)',
					800: 'rgb(var(--tw-text-gray-800) / <alpha-value>)',
					900: 'rgb(var(--tw-text-gray-900) / <alpha-value>)',
					950: 'rgb(var(--tw-text-gray-950) / <alpha-value>)'
				},
				neutral: {
					50: 'rgb(var(--tw-text-neutral-50) / <alpha-value>)',
					100: 'rgb(var(--tw-text-neutral-100) / <alpha-value>)',
					200: 'rgb(var(--tw-text-neutral-200) / <alpha-value>)',
					300: 'rgb(var(--tw-text-neutral-300) / <alpha-value>)',
					400: 'rgb(var(--tw-text-neutral-400) / <alpha-value>)',
					500: 'rgb(var(--tw-text-neutral-500) / <alpha-value>)',
					600: 'rgb(var(--tw-text-neutral-600) / <alpha-value>)',
					700: 'rgb(var(--tw-text-neutral-700) / <alpha-value>)',
					800: 'rgb(var(--tw-text-neutral-800) / <alpha-value>)',
					900: 'rgb(var(--tw-text-neutral-900) / <alpha-value>)',
					950: 'rgb(var(--tw-text-neutral-950) / <alpha-value>)'
				}
			},
			colors: {
				// No pure white/black: bg-white, text-black etc. resolve to tokens.css neutral-0 / neutral-900.
				white: '#FFFDFA',
				black: '#0E0E0E',
				border: 'hsl(var(--border))',
				input: 'hsl(var(--input))',
				ring: 'hsl(var(--ring))',
				background: 'hsl(var(--background))',
				foreground: 'hsl(var(--foreground))',
				primary: {
					DEFAULT: 'hsl(var(--primary))',
					light: 'hsl(var(--primary-light))',
					dark: 'hsl(var(--primary-dark))',
					foreground: 'hsl(var(--primary-foreground))'
				},
				secondary: {
					DEFAULT: 'hsl(var(--secondary))',
					foreground: 'hsl(var(--secondary-foreground))'
				},
				destructive: {
					DEFAULT: 'hsl(var(--destructive))',
					foreground: 'hsl(var(--destructive-foreground))'
				},
				muted: {
					DEFAULT: 'hsl(var(--muted))',
					foreground: 'hsl(var(--muted-foreground))'
				},
				accent: {
					DEFAULT: 'hsl(var(--accent))',
					foreground: 'hsl(var(--accent-foreground))'
				},
				card: {
					DEFAULT: 'hsl(var(--card))',
					foreground: 'hsl(var(--card-foreground))',
					shadow: 'hsl(var(--card-shadow))'
				},
				success: 'hsl(var(--success))',
				warning: 'hsl(var(--warning))',
				// Synth Brand Colors
				synth: {
					pink: 'rgb(204 36 134 / <alpha-value>)',
					'pink-light': '#FF66B3',
					'pink-dark': '#E6007A',
					beige: '#F5F5DC',
					'beige-light': '#FAFAF5',
					'beige-dark': '#E6E6D1',
					black: '#0E0E0E',
					'black-light': '#1A1A1A',
					'black-dark': '#0D0D0D'
				},
				// Event categories with Synth theme
				music: 'hsl(var(--music))',
				food: 'hsl(var(--food))',
				arts: 'hsl(var(--arts))',
				sports: 'hsl(var(--sports))',
				social: 'hsl(var(--social))',
				sidebar: {
					DEFAULT: 'hsl(var(--sidebar-background))',
					foreground: 'hsl(var(--sidebar-foreground))',
					primary: 'hsl(var(--sidebar-primary))',
					'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
					accent: 'hsl(var(--sidebar-accent))',
					'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
					border: 'hsl(var(--sidebar-border))',
					ring: 'hsl(var(--sidebar-ring))'
				}
			},
			borderRadius: {
				lg: '10px',
				md: '10px',
				sm: '10px',
				DEFAULT: '10px',
				full: '50%'
			},
			keyframes: {
				'accordion-down': {
					from: { height: '0' },
					to: { height: 'var(--radix-accordion-content-height)' }
				},
				'accordion-up': {
					from: { height: 'var(--radix-accordion-content-height)' },
					to: { height: '0' }
				},
				'swipe-like': {
					'0%': { transform: 'translateX(0) rotate(0deg)', opacity: '1' },
					'100%': { transform: 'translateX(100px) rotate(15deg)', opacity: '0' }
				},
				'swipe-pass': {
					'0%': { transform: 'translateX(0) rotate(0deg)', opacity: '1' },
					'100%': { transform: 'translateX(-100px) rotate(-15deg)', opacity: '0' }
				},
				'bounce-in': {
					'0%': { transform: 'scale(0.3)', opacity: '0' },
					'50%': { transform: 'scale(1.05)', opacity: '0.8' },
					'100%': { transform: 'scale(1)', opacity: '1' }
				},
				'pulse-glow': {
					'0%, 100%': { opacity: '1' },
					'50%': { opacity: '0.6' }
				}
			},
			animation: {
				'accordion-down': 'accordion-down 0.2s ease-out',
				'accordion-up': 'accordion-up 0.2s ease-out',
				'swipe-like': 'swipe-like 0.3s ease-out forwards',
				'swipe-pass': 'swipe-pass 0.3s ease-out forwards',
				'bounce-in': 'bounce-in 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
				'pulse-glow': 'pulse-glow 2s ease-in-out infinite'
			}
		}
	},
	plugins: [require("tailwindcss-animate")],
} satisfies Config;

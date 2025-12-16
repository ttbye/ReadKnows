/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: 'var(--accent-color)',
      },
      screens: {
        // 调整断点，使 iPad 横屏时使用移动端样式
        // iPad mini 横屏: 1024px
        // iPad Air 横屏: 1180px
        // iPad Pro 横屏: 1366px
        // 将 lg 断点提高到 1280px，这样所有 iPad 横屏都会使用移动端样式
        'lg': '1280px',
        // 其他断点保持不变
        'sm': '640px',
        'md': '768px',
        'xl': '1536px',
        '2xl': '1536px',
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}


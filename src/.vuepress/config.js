const { description } = require("../../package")

module.exports = {
  base: '/documentation/',
  /**
   * Ref：https://v1.vuepress.vuejs.org/config/#title
   */
  title: "Well Known Components",
  /**
   * Ref：https://v1.vuepress.vuejs.org/config/#description
   */
  description: "A different way to create boring applications",

  /**
   * Extra tags to be injected to the page HTML `<head>`
   *
   * ref：https://v1.vuepress.vuejs.org/config/#head
   */
  head: [
    ["meta", { name: "theme-color", content: "#3eaf7c" }],
    ["meta", { name: "apple-mobile-web-app-capable", content: "yes" }],
    ["meta", { name: "apple-mobile-web-app-status-bar-style", content: "black" }],
  ],

  /**
   * Theme configuration, here is the default theme configuration for VuePress.
   *
   * ref：https://v1.vuepress.vuejs.org/theme/default-theme-config.html
   */
  themeConfig: {
    repo: "",
    editLinks: false,
    docsDir: "",
    editLinkText: "",
    lastUpdated: false,
    nav: [
      {
        text: "Documentation",
        link: "/docs/",
      },
      {
        text: "Config",
        link: "/config/",
      },
    ],
    sidebar: [
      {
        title: "Documentation",
        path: "/docs/",
        collapsable: false,
        children: ["/docs/", "/docs/philosophy"],
      },
      {
        title: "Libraries (Ports)",
        path: "/ports/",
        collapsable: false,
        children: ["/ports/", "/ports/lifecycle", "/ports/http-server"],
      },
    ],
  },

  /**
   * Apply plugins，ref：https://v1.vuepress.vuejs.org/zh/plugin/
   */
  plugins: ["@vuepress/plugin-back-to-top", "@vuepress/plugin-medium-zoom"],
}

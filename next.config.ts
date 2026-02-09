import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
});

export default withSerwist({
  turbopack: {}, // Silence Next.js 16 Turbopack warning
  async redirects() {
    return [
      // Legacy path aliases that can still exist in stale clients/bookmarks
      { source: "/dashboard", destination: "/", permanent: false },
      { source: "/dashboard/:path*", destination: "/:path*", permanent: false },
      { source: "/project/:id", destination: "/projects/:id", permanent: false },
      { source: "/project/:id/build", destination: "/projects/:id/build", permanent: false },
      {
        source: "/project/:id/milestone/:milestoneId",
        destination: "/projects/:id/milestone/:milestoneId",
        permanent: false,
      },
      {
        source: "/projects/:id/milestones/:milestoneId",
        destination: "/projects/:id/milestone/:milestoneId",
        permanent: false,
      },
      { source: "/projects/:id/work", destination: "/projects/:id/build", permanent: false },
    ];
  },
});

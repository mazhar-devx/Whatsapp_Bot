/**
 * Mazhar (DevX) Official Portfolio Data
 * Extracted from: https://mazhar-devx.netlify.app/
 */

const portfolioData = {
    bio: {
        title: "MERN Stack Expert & Technical Leader",
        philosophy: "Elite Full-Stack Developer specializing in architectural precision and design excellence. I design systems that solve real-world problems through performant architecture.",
        slogan: "Crafting digital experiences that make an impact."
    },
    techStack: [
        "MERN Stack (MongoDB, Express, React, Node.js)",
        "Next.js & SSR Optimization",
        "Three.js (3D Web Interaction)",
        "Cloud-native Architectures",
        "TypeScript & Type-safe Backends",
        "JWT & Secure Authentication",
        "CI/CD Practices"
    ],
    projects: [
        {
            name: "ShopHub.pro",
            detail: "Full-stack MERN ecommerce platform with secure auth, user management, and dynamic product handling.",
            url: "https://www.shophub.pro/"
        },
        {
            name: "Trace Core",
            detail: "AI-powered memory sanctuary and document management for deep self-discovery and data preservation.",
            url: "https://trace.ct.ws"
        },
        {
            name: "Toyota GT Motors",
            detail: "Premium automotive dealership platform with integrated booking and vehicle specifications.",
            url: "https://mazhar-devx.netlify.app/"
        },
        {
            name: "QA Orchestrator",
            detail: "Automated testing environment for validating web reliability."
        }
    ],
    experience: [
        {
            role: "Lead Full Stack Engineer",
            company: "Nifty Code",
            highlights: [
                "Led team on multiple SaaS projects",
                "Developed multi-role CRM solutions for lead engagement",
                "Completed 20+ projects ranging from dashboards to complex tools"
            ]
        },
        {
            role: "Full Stack Engineer",
            company: "QuantumHub",
            highlights: [
                "Audit management platform for hospitals with 10+ user types",
                "Developed compliance algorithms for healthcare standards",
                "Built complex charts for multi-type data operations"
            ]
        },
        {
            role: "Full Stack Web Developer",
            company: "Sparkleo Technologies",
            highlights: [
                "Achieved 90+ website performance scores using SSR",
                "Reduced LCP and data rendering times by 60%",
                "Implemented 15+ interactive web layouts"
            ]
        }
    ],
    achievements: [
        "SEO scores of 99 and page speed scores of 95+",
        "Reduced bot-generated spam by 80% using Cloudflare",
        "3x increase in user retainability through UI/UX coordination"
    ]
};

module.exports = { portfolioData };

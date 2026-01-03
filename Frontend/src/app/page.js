// src/app/page.js
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Train, Calendar, Users, FileText, BarChart3, Shield, Zap, Clock, ChevronRight, CheckCircle, ArrowRight, TrendingUp, Cpu, ShieldCheck, BatteryCharging } from 'lucide-react';
import { useAuth } from './context/AuthContext';

export default function LandingPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!loading && user && user.emailVerified) {
      router.push('/dashboard');
    }
    // Trigger animations on mount
    setTimeout(() => setIsVisible(true), 100);
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-gray-50 to-white">
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-r from-gray-900 to-gray-700 rounded-full blur-xl opacity-20 animate-pulse"></div>
          <div className="relative animate-spin rounded-full h-16 w-16 border-4 border-gray-900 border-t-transparent"></div>
        </div>
        <p className="mt-4 text-gray-600 font-medium">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50/50 via-white/50 to-gray-100/50">
      {/* Navigation - Sticky & Enhanced */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-gray-200/80 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center group cursor-pointer">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-gray-900 to-gray-700 rounded-lg blur opacity-30 group-hover:opacity-50 transition-opacity"></div>
                <Train className="h-8 w-8 text-gray-900 relative z-10 group-hover:scale-110 transition-transform" />
              </div>
              <div className="ml-3">
                <h1 className="text-lg font-bold text-gray-900 tracking-tight">RailSync Pro</h1>
                <p className="text-xs text-gray-500 font-medium">Intelligent Rail Management</p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <Link href="/login">
                <button className="px-5 py-2 text-gray-700 hover:text-gray-900 font-medium rounded-lg hover:bg-gray-100 transition-all duration-200">
                  Sign In
                </button>
              </Link>
              <Link href="/signup">
                <button className="px-6 py-2.5 bg-gradient-to-r from-gray-900 to-gray-800 text-white rounded-lg hover:shadow-lg hover:scale-[1.02] transition-all duration-200 font-medium shadow-md">
                  Get Started Free
                  <ChevronRight className="inline-block ml-1 h-4 w-4" />
                </button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section with Background Image */}
      <section className="relative isolate overflow-hidden min-h-[90vh]">
        {/* Background Image with Enhanced Overlay */}
        <div className="absolute inset-0 -z-20">
          <img
            src="/Indore.png"
            alt="Modern railway system with trains in motion"
            className="h-full w-full object-cover object-center"
            loading="eager"
          />
          {/* Enhanced gradient overlay for better readability */}
          <div className="absolute inset-0 bg-gradient-to-br from-gray-50/95 via-gray-100/90 to-gray-200/85" />
          <div className="absolute inset-0 bg-gradient-to-t from-gray-900/10 via-transparent to-gray-900/5" />
        </div>

        {/* Animated background elements */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute left-1/4 top-0 w-72 h-72 bg-gradient-to-br from-gray-900/20 to-transparent rounded-full blur-3xl" />
          <div className="absolute right-1/4 bottom-0 w-96 h-96 bg-gradient-to-tr from-gray-900/10 to-transparent rounded-full blur-3xl" />
          
          {/* Grid pattern overlay */}
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.1)_1px,transparent_1px)] bg-[size:4rem_4rem]" />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24 min-h-[90vh] flex items-center">
          <div className={`w-full transition-all duration-700 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            <div className="text-center max-w-4xl mx-auto">
              <div className="inline-flex items-center px-4 py-2 rounded-full bg-white/80 backdrop-blur-sm text-gray-700 text-sm font-medium mb-8 border border-gray-200/50 shadow-sm">
                <TrendingUp className="h-4 w-4 mr-2" />
                Trusted by 50+ railway operators worldwide
              </div>
              
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-gray-900 mb-6 leading-tight tracking-tight">
                Revolutionizing
                <span className="block mt-2 bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
                  Railway Operations
                </span>
              </h1>
              
              <p className="text-lg sm:text-xl text-gray-700 mb-10 max-w-3xl mx-auto leading-relaxed backdrop-blur-[2px]">
                An all-in-one platform for intelligent fleet management, predictive maintenance, 
                and operational excellence. Reduce downtime by 40% and increase efficiency.
              </p>
              
              <div className="flex flex-col sm:flex-row justify-center gap-4 mb-16">
                <Link href="/signup">
                  <button className="group relative px-8 py-4 bg-gradient-to-r from-gray-900 to-gray-800 text-white rounded-xl hover:shadow-2xl transition-all duration-300 font-medium text-lg overflow-hidden shadow-lg">
                    <div className="absolute inset-0 bg-gradient-to-r from-gray-800 to-gray-700 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <span className="relative flex items-center justify-center">
                      Start Free Trial
                      <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                    </span>
                  </button>
                </Link>
                <Link href="/login">
                  <button className="px-8 py-4 bg-white/90 backdrop-blur-sm text-gray-900 border-2 border-gray-200/50 rounded-xl hover:border-gray-300 hover:bg-white font-medium text-lg transition-all duration-300 shadow-sm hover:shadow-md">
                    Schedule Demo
                  </button>
                </Link>
              </div>

              {/* Interactive Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-2xl mx-auto">
                {[
                  { value: '99.8%', label: 'System Reliability', icon: ShieldCheck },
                  { value: '40%', label: 'Cost Reduction', icon: TrendingUp },
                  { value: '24/7', label: 'Real-time Monitoring', icon: Cpu },
                  { value: '50+', label: 'Rail Networks', icon: BatteryCharging }
                ].map((stat, idx) => (
                  <div 
                    key={idx}
                    className="bg-white/90 backdrop-blur-sm p-5 rounded-xl border border-gray-200/50 shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-1"
                  >
                    <div className="flex items-center justify-center mb-2">
                      <stat.icon className="h-5 w-5 text-gray-700 mr-2" />
                      <div className="text-2xl font-bold text-gray-900">{stat.value}</div>
                    </div>
                    <div className="text-sm text-gray-600 font-medium">{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section - Enhanced with Cards */}
      <section className="relative bg-white py-20">
        {/* Background pattern for features */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-gray-50/30 to-transparent" />
        
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Powerful Features for Modern Railways
            </h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Everything you need to optimize operations, reduce costs, and ensure safety
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                icon: BarChart3,
                title: "Live Dashboard",
                description: "Real-time monitoring of all trainsets with predictive analytics",
                color: "from-blue-500 to-cyan-500"
              },
              {
                icon: Calendar,
                title: "Smart Scheduling",
                description: "AI-powered scheduling optimized for efficiency and constraints",
                color: "from-purple-500 to-pink-500"
              },
              {
                icon: Users,
                title: "Team Collaboration",
                description: "Seamless coordination between operations and maintenance teams",
                color: "from-orange-500 to-red-500"
              },
              {
                icon: FileText,
                title: "Automated Reports",
                description: "Generate compliance and performance reports automatically",
                color: "from-green-500 to-emerald-500"
              }
            ].map((feature, index) => (
              <div
                key={index}
                className="group relative bg-white rounded-2xl p-6 border border-gray-200 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-2"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-gray-50 to-white rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative">
                  <div className={`h-14 w-14 bg-gradient-to-r ${feature.color} rounded-xl flex items-center justify-center mb-5 shadow-lg`}>
                    <feature.icon className="h-7 w-7 text-white" />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 mb-3">{feature.title}</h3>
                  <p className="text-gray-600 text-sm leading-relaxed">{feature.description}</p>
                  <div className="mt-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <ChevronRight className="h-5 w-5 text-gray-400 group-hover:text-gray-600 group-hover:translate-x-1 transition-all" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits Section - Enhanced */}
      <section className="bg-gradient-to-b from-white to-gray-50 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            <div>
              <h2 className="text-3xl font-bold text-gray-900 mb-8">
                Transform Your Railway Operations
              </h2>
              <div className="space-y-6">
                {[
                  {
                    icon: Shield,
                    title: "Enterprise Security",
                    description: "Bank-level security with multi-factor authentication and encrypted data",
                    features: ["SOC 2 Compliant", "GDPR Ready", "24/7 Monitoring"]
                  },
                  {
                    icon: Zap,
                    title: "Lightning Fast",
                    description: "Optimized workflows that reduce operational time by 60%",
                    features: ["Real-time Updates", "Instant Alerts", "Quick Deployment"]
                  },
                  {
                    icon: Clock,
                    title: "Always Available",
                    description: "99.9% uptime guarantee with automated failover systems",
                    features: ["Global CDN", "Auto-scaling", "Disaster Recovery"]
                  }
                ].map((benefit, index) => (
                  <div 
                    key={index}
                    className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-300"
                  >
                    <div className="flex items-start">
                      <div className="shrink-0">
                        <div className="h-12 w-12 bg-gradient-to-br from-gray-900 to-gray-700 rounded-lg flex items-center justify-center">
                          <benefit.icon className="h-6 w-6 text-white" />
                        </div>
                      </div>
                      <div className="ml-4">
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">{benefit.title}</h3>
                        <p className="text-gray-600 mb-3">{benefit.description}</p>
                        <div className="flex flex-wrap gap-2">
                          {benefit.features.map((feature, idx) => (
                            <span key={idx} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              {feature}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* CTA Card */}
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-gray-900 to-gray-800 rounded-3xl blur-xl opacity-20" />
              <div className="relative bg-gradient-to-br from-gray-900 to-gray-800 rounded-3xl p-8 text-white overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-16 translate-x-16" />
                <div className="absolute bottom-0 left-0 w-40 h-40 bg-white/5 rounded-full translate-y-20 -translate-x-20" />
                
                <div className="relative z-10">
                  <Train className="h-20 w-20 mx-auto mb-6 text-white/90" />
                  <h3 className="text-2xl font-bold mb-4">Ready to Transform Your Operations?</h3>
                  <p className="text-gray-300 mb-6">
                    Join the leading railway operators who trust our platform for their daily operations.
                  </p>
                  
                  <div className="space-y-4">
                    <Link href="/signup">
                      <button className="w-full py-3 bg-white text-gray-900 rounded-xl hover:bg-gray-100 font-semibold transition-all duration-300 hover:scale-[1.02]">
                        Start Free 14-Day Trial
                      </button>
                    </Link>
                    <Link href="/contact">
                      <button className="w-full py-3 bg-transparent border-2 border-white/30 text-white rounded-xl hover:bg-white/10 font-medium transition-all duration-300">
                        Request Custom Demo
                      </button>
                    </Link>
                  </div>
                  
                  <div className="mt-6 pt-6 border-t border-white/20">
                    <div className="flex items-center justify-center text-sm text-gray-300">
                      <CheckCircle className="h-4 w-4 mr-2" />
                      No credit card required • Cancel anytime
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonial/Trust Section */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h3 className="text-2xl font-bold text-gray-900 mb-4">Trusted by Industry Leaders</h3>
            <p className="text-gray-600">Join railways that have transformed their operations</p>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {["RailNet Inc", "Metro Express", "TransGlobal", "CityRail"].map((company, idx) => (
              <div key={idx} className="flex items-center justify-center p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors duration-300">
                <div className="text-center">
                  <div className="h-10 w-10 bg-gradient-to-r from-gray-900 to-gray-700 rounded-lg flex items-center justify-center mx-auto mb-2">
                    <Train className="h-5 w-5 text-white" />
                  </div>
                  <span className="font-semibold text-gray-900">{company}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="relative bg-gradient-to-r from-gray-900 to-gray-800 py-20 overflow-hidden">
        {/* Background pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:4rem_4rem]" />
        
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-white mb-6">
            Start Your Digital Transformation Today
          </h2>
          <p className="text-xl text-gray-300 mb-8">
            Experience the future of railway management with our 14-day free trial
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/signup">
              <button className="px-8 py-4 bg-white text-gray-900 rounded-xl hover:bg-gray-100 font-semibold text-lg transition-all duration-300 hover:scale-[1.02] shadow-lg">
                Get Started Free
              </button>
            </Link>
            <Link href="/contact">
              <button className="px-8 py-4 bg-transparent border-2 border-white text-white rounded-xl hover:bg-white/10 font-semibold text-lg transition-all duration-300">
                Contact Sales
              </button>
            </Link>
          </div>
          <p className="mt-6 text-gray-400 text-sm">
            Full access to all features • No credit card required • Dedicated support
          </p>
        </div>
      </section>

      {/* Enhanced Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center mb-6 md:mb-0">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-gray-700 to-gray-600 rounded-lg blur opacity-30"></div>
                <Train className="h-8 w-8 relative z-10" />
              </div>
              <div className="ml-3">
                <h3 className="text-lg font-bold">RailSync Pro</h3>
                <p className="text-sm text-gray-400">Intelligent Railway Management</p>
              </div>
            </div>
            
            <div className="flex flex-wrap gap-6 text-sm text-gray-400">
              <Link href="/privacy" className="hover:text-white transition-colors">
                Privacy Policy
              </Link>
              <Link href="/terms" className="hover:text-white transition-colors">
                Terms of Service
              </Link>
              <Link href="/contact" className="hover:text-white transition-colors">
                Contact
              </Link>
              <Link href="/docs" className="hover:text-white transition-colors">
                Documentation
              </Link>
            </div>
          </div>
          
          <div className="mt-8 pt-8 border-t border-gray-800 text-center">
            <p className="text-gray-400 text-sm">
              © {new Date().getFullYear()} RailSync Pro. All rights reserved. Built with ❤️ for railway excellence.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
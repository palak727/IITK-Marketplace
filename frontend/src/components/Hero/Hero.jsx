import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, BedDouble, Bike, BookOpen, Package, Refrigerator, Wind } from 'lucide-react';
import { CATEGORIES } from '../../utils/api';

const ICONS = { coolers: Wind, mattresses: BedDouble, cycles: Bike, academics: BookOpen, appliances: Refrigerator, others: Package };

const Hero = () => (
  <section className="market-hero">
    <div className="market-hero-inner">
      <motion.div className="hero-copy" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .3 }}>
        
        <h1>Good things find<br /><em>a second home.</em></h1>
        <p className="hero-description">A practical place to buy and sell the things that make campus life work — from cycles and coolers to books and room essentials.</p>
        <div className="hero-actions">
          <Link to="/category/cycles" className="btn-primary">Browse listings <ArrowUpRight size={16} /></Link>
          <Link to="/dashboard" className="hero-sell">Have something to sell? <span>List an item</span></Link>
        </div>
      </motion.div>
      <div className="category-index" aria-label="Shop by category">
        <div className="category-index-heading">Browse by need</div>
        {CATEGORIES.map((category) => {
          const Icon = ICONS[category.slug] || Wind;
          return <Link className="category-index-row" key={category.slug} to={category.path}>
            <Icon size={17} strokeWidth={1.6} />
            <span className="category-index-name">{category.label}</span>
            <ArrowRight className="category-index-arrow" size={15} strokeWidth={1.7} />
          </Link>;
        })}
      </div>
    </div>
  </section>
);

export default Hero;

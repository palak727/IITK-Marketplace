import { motion } from 'framer-motion';
import iitkLogo from '../../assets/iitk_logo.jpeg';
import { HALLS } from '../../utils/api';

const Footer = () => {
  return (
    <footer className="bg-navy text-white mt-auto border-t border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="md:col-span-1"
          >
            <div className="flex items-center gap-3 mb-4">
              <img
                src={iitkLogo}
                alt="IIT Kanpur logo"
                className="w-10 h-10 object-contain rounded-xl bg-white/5 p-1"
              />
              <div>
                <h3 className="font-bold text-base">IITK Marketplace</h3>
                <p className="text-amber text-xs font-semibold">Student essentials hub</p>
              </div>
            </div>
            <p className="text-slate-400 text-sm leading-relaxed mb-4">
              A simple campus marketplace for students to buy, sell, and trade everyday essentials without the hassle.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
          >
            <h4 className="font-semibold text-sm mb-4 text-white uppercase tracking-wider">Halls of Residence</h4>
            <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-slate-400 text-xs">
              {HALLS.slice(0, 12).map((hall) => (
                <span key={hall} className="hover:text-amber transition-colors cursor-default">
                  • {hall}
                </span>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
          >
            <h4 className="font-semibold text-sm mb-4 text-white uppercase tracking-wider">Campus Essentials</h4>
            <ul className="space-y-2 text-slate-400 text-sm">
              <li>Cooling essentials</li>
              <li>Comfort items</li>
              <li>Campus rides</li>
              <li>Study materials</li>
              <li>Room appliances</li>
            </ul>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 }}
          >
            <h4 className="font-semibold text-sm mb-4 text-white uppercase tracking-wider">
              IIT Kanpur
            </h4>
            <ul className="space-y-2.5 text-slate-400 text-sm">
              <li>Kalyanpur, Kanpur, UP 208016</li>
              <li>Campus student marketplace</li>
            </ul>
          </motion.div>
        </div>

        <div className="border-t border-white/10 mt-10 pt-6 flex flex-col sm:flex-row items-center justify-between text-slate-400 text-xs gap-4">
          <p>© {new Date().getFullYear()} IITK Campus Marketplace · All rights reserved.</p>
          <p className="text-slate-400">Built for the IITK student community</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;

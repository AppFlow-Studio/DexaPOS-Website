import Image from "next/image";
export default function MarketingFooter() {
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="footer-top">
          <div>
            <a href="/" className="logo">
               <Image
                  src="/dexalogolight.png"
                  alt="DexaPOS"
                  width={56}
                  height={56}
                  priority
                  className="h-14 w-14 rounded-xl object-cover"
                />
              DEXA POS
            </a>
            <p className="footer-tag">
              The all-in-one point-of-sale platform built for modern
              restaurants.
            </p>
          </div>
          <div className="footer-col">
            <h5>Product</h5>
            <ul>
              <li><a href="/features">Features</a></li>
              <li><a href="/hardware">Hardware</a></li>
              <li><a href="/why">Why DEXA</a></li>
              <li><a href="/industries">Industries</a></li>
              <li><a href="/demo">Live Demo</a></li>
            </ul>
          </div>
          <div className="footer-col">
            <h5>Company</h5>
            <ul>
              <li><a href="#">About</a></li>
              <li><a href="#">Partners</a></li>
              <li><a href="#">Careers</a></li>
              <li><a href="#">Press</a></li>
            </ul>
          </div>
          <div className="footer-col">
            <h5>Support</h5>
            <ul>
              <li><a href="/contact">Request Demo</a></li>
              <li><a href="#">Documentation</a></li>
              <li><a href="#">Status</a></li>
              <li><a href="#">Contact</a></li>
            </ul>
          </div>
        </div>
        <div className="footer-base">
          <span>© 2026 DEXA POS LLC. All rights reserved.</span>
          <span>
            <a href="#">Privacy</a>
            <a href="#">Terms</a>
            <a href="#">Security</a>
          </span>
        </div>
      </div>
    </footer>
  );
}

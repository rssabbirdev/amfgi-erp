// 'use client';

// import { useState }        from 'react';
// import { signIn }          from 'next-auth/react';
// import { useRouter, useSearchParams } from 'next/navigation';
// import { Button }          from '@/components/ui/Button';
// import toast               from 'react-hot-toast';

// export default function LoginPage() {
//   const router      = useRouter();
//   const params      = useSearchParams();
//   const callbackUrl = params.get('callbackUrl') ?? '/dashboard';
//   const error       = params.get('error');

//   const [email,    setEmail]    = useState('');
//   const [password, setPassword] = useState('');
//   const [loading,  setLoading]  = useState(false);

//   const handleCredentials = async (e: React.FormEvent) => {
//     e.preventDefault();
//     setLoading(true);
//     const result = await signIn('credentials', {
//       email,
//       password,
//       redirect: false,
//     });
//     setLoading(false);
//     if (result?.error) {
//       toast.error('Invalid email or password');
//     } else {
//       router.push(callbackUrl);
//     }
//   };

//   const handleGoogle = () => signIn('google', { callbackUrl });

//   return (
//     <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
//       <div className="w-full max-w-md">
//         {/* Brand */}
//         <div className="text-center mb-8">
//           <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 mb-4">
//             <span className="text-white font-bold text-2xl">A</span>
//           </div>
//           <h1 className="text-2xl font-bold text-white">AMFGI ERP</h1>
//           <p className="text-slate-400 text-sm mt-1">Almuraqib Fiber Glass Industry</p>
//         </div>

//         {/* Card */}
//         <div className="bg-slate-800 rounded-2xl border border-slate-700 p-8 space-y-6">
//           <h2 className="text-lg font-semibold text-white">Sign in to your account</h2>

//           {error === 'NotRegistered' && (
//             <div className="rounded-lg bg-red-900/30 border border-red-700 px-4 py-3 text-sm text-red-300">
//               Your Google account is not registered. Contact an administrator.
//             </div>
//           )}

//           <form onSubmit={handleCredentials} className="space-y-4">
//             <div>
//               <label className="block text-sm font-medium text-slate-300 mb-1.5">
//                 Email address
//               </label>
//               <input
//                 type="email"
//                 required
//                 autoComplete="email"
//                 value={email}
//                 onChange={(e) => setEmail(e.target.value)}
//                 className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500 focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
//                 placeholder="you@almuraqib.com"
//               />
//             </div>
//             <div>
//               <label className="block text-sm font-medium text-slate-300 mb-1.5">
//                 Password
//               </label>
//               <input
//                 type="password"
//                 required
//                 autoComplete="current-password"
//                 value={password}
//                 onChange={(e) => setPassword(e.target.value)}
//                 className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500 focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
//                 placeholder="••••••••"
//               />
//             </div>
//             <Button type="submit" loading={loading} fullWidth size="lg">
//               Sign in
//             </Button>
//           </form>

//           <div className="relative">
//             <div className="absolute inset-0 flex items-center">
//               <div className="w-full border-t border-slate-700" />
//             </div>
//             <div className="relative flex justify-center text-xs">
//               <span className="bg-slate-800 px-3 text-slate-500">or continue with</span>
//             </div>
//           </div>

//           <Button
//             type="button"
//             variant="outline"
//             fullWidth
//             onClick={handleGoogle}
//           >
//             <svg className="h-4 w-4" viewBox="0 0 24 24">
//               <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
//               <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
//               <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
//               <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
//             </svg>
//             Google Workspace
//           </Button>
//         </div>
//       </div>
//     </div>
//   );
// }

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import toast from 'react-hot-toast';

export default function LoginPage() {
	const router = useRouter();
	const params = useSearchParams();
	const callbackUrl = params.get('callbackUrl') ?? '/';
	const error = params.get('error');

	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [loading, setLoading] = useState(false);

	const handleCredentials = async (e: React.FormEvent) => {
		e.preventDefault();
		setLoading(true);
		const result = await signIn('credentials', {
			email,
			password,
			redirect: false,
		});
		setLoading(false);
		if (result?.error) {
			toast.error('Invalid email or password');
		} else {
			router.push(callbackUrl);
		}
	};

	const handleGoogle = () => signIn('google', { callbackUrl });

	const handleUseCredentials = (testEmail: string, testPassword: string) => {
		setEmail(testEmail);
		setPassword(testPassword);
		toast.success('Credentials filled', {
			style: {
				background: '#1e293b',
				color: '#10b981',
				border: '1px solid #334155',
			},
			iconTheme: { primary: '#10b981', secondary: '#1e293b' },
		});
	};

	return (
		<div className='min-h-screen bg-slate-950 flex items-center justify-center p-4'>
			<div className='w-full max-w-md'>
				{/* Brand */}
				<div className='text-center mb-8'>
					<div className='inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 mb-4'>
						<span className='text-white font-bold text-2xl'>A</span>
					</div>
					<h1 className='text-2xl font-bold text-white'>AMFGI ERP</h1>
					<p className='text-slate-400 text-sm mt-1'>
						Almuraqib Fiber Glass Industry
					</p>
				</div>

				{/* Card */}
				<div className='bg-slate-800 rounded-2xl border border-slate-700 p-8 space-y-6'>
					<h2 className='text-lg font-semibold text-white'>
						Sign in to your account
					</h2>

					{error === 'NotRegistered' && (
						<div className='rounded-lg bg-red-900/30 border border-red-700 px-4 py-3 text-sm text-red-300'>
							Your Google account is not registered. Contact an
							administrator.
						</div>
					)}

					<form onSubmit={handleCredentials} className='space-y-4'>
						<div>
							<label className='block text-sm font-medium text-slate-300 mb-1.5'>
								Email address
							</label>
							<input
								type='email'
								required
								autoComplete='email'
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								className='w-full px-3.5 py-2.5 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500 focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition'
								placeholder='you@almuraqib.com'
							/>
						</div>
						<div>
							<label className='block text-sm font-medium text-slate-300 mb-1.5'>
								Password
							</label>
							<input
								type='password'
								required
								autoComplete='current-password'
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								className='w-full px-3.5 py-2.5 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500 focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition'
								placeholder='••••••••'
							/>
						</div>
						<Button
							type='submit'
							loading={loading}
							fullWidth
							size='lg'
						>
							Sign in
						</Button>
					</form>

					<div className='relative'>
						<div className='absolute inset-0 flex items-center'>
							<div className='w-full border-t border-slate-700' />
						</div>
						<div className='relative flex justify-center text-xs'>
							<span className='bg-slate-800 px-3 text-slate-500'>
								or continue with
							</span>
						</div>
					</div>

					<Button
						type='button'
						variant='outline'
						fullWidth
						onClick={handleGoogle}
					>
						<svg className='h-4 w-4 mr-2' viewBox='0 0 24 24'>
							<path
								fill='#4285F4'
								d='M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z'
							/>
							<path
								fill='#34A853'
								d='M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z'
							/>
							<path
								fill='#FBBC05'
								d='M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z'
							/>
							<path
								fill='#EA4335'
								d='M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z'
							/>
						</svg>
						Google Workspace
					</Button>
				</div>

				{/* Test Credentials Info Box */}
				<div className='mt-6 bg-slate-800/40 border border-slate-700/50 rounded-xl p-5 text-sm'>
					<div className='flex items-center gap-2 mb-4'>
						<svg
							className='w-4 h-4 text-emerald-500'
							fill='none'
							viewBox='0 0 24 24'
							stroke='currentColor'
						>
							<path
								strokeLinecap='round'
								strokeLinejoin='round'
								strokeWidth={2}
								d='M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
							/>
						</svg>
						<h3 className='font-semibold text-slate-200'>
							Test Credentials
						</h3>
					</div>

					<div className='space-y-3 font-mono text-xs'>
						{/* Super Admin */}
						<div className='flex justify-between items-center bg-slate-900/50 p-3 rounded-lg border border-slate-700/50'>
							<div className='flex flex-col gap-1'>
								<span className='text-slate-300 font-sans font-medium'>
									Super Admin
								</span>
								<span className='text-slate-500'>
									admin@almuraqib.com
								</span>
							</div>
							<button
								type='button'
								onClick={() =>
									handleUseCredentials(
										'admin@almuraqib.com',
										'Admin@1234',
									)
								}
								className='px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-md transition-colors font-sans font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/50'
							>
								Use
							</button>
						</div>

						{/* Manager */}
						<div className='flex justify-between items-center bg-slate-900/50 p-3 rounded-lg border border-slate-700/50'>
							<div className='flex flex-col gap-1'>
								<span className='text-slate-300 font-sans font-medium'>
									AMFGI Manager
								</span>
								<span className='text-slate-500'>
									manager@amfgi.com
								</span>
							</div>
							<button
								type='button'
								onClick={() =>
									handleUseCredentials(
										'manager@amfgi.com',
										'Manager@1234',
									)
								}
								className='px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-md transition-colors font-sans font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/50'
							>
								Use
							</button>
						</div>

						{/* Store Keeper */}
						<div className='flex justify-between items-center bg-slate-900/50 p-3 rounded-lg border border-slate-700/50'>
							<div className='flex flex-col gap-1'>
								<span className='text-slate-300 font-sans font-medium'>
									Store Keeper
								</span>
								<span className='text-slate-500'>
									storekeeper@amfgi.com
								</span>
							</div>
							<button
								type='button'
								onClick={() =>
									handleUseCredentials(
										'storekeeper@amfgi.com',
										'Store@1234',
									)
								}
								className='px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-md transition-colors font-sans font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/50'
							>
								Use
							</button>
						</div>
					</div>
				</div>

				<div className='mt-5 flex items-center justify-center gap-4 text-xs text-slate-400'>
					<Link
						href='/privacy-policy'
						className='transition hover:text-emerald-300'
					>
						Privacy Policy
					</Link>
					<span className='text-slate-600'>•</span>
					<Link
						href='/terms-of-service'
						className='transition hover:text-emerald-300'
					>
						Terms of Service
					</Link>
				</div>
			</div>
		</div>
	);
}

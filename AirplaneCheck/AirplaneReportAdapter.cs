using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

using Android.App;
using Android.Content;
using Android.OS;
using Android.Runtime;
using Android.Views;
using Android.Widget;

namespace AirplaneCheck
{
	class AirplaneReportAdapter : BaseAdapter<AirplaneReport>
    {
		List<AirplaneReport> _ar;
		Activity _context;
//		public AirplaneReportAdapter(Activity context, List<AirplaneInfo> ar) : base() {
//            this._context = context;
//			this._ar = ar;
//        }
		public AirplaneReportAdapter(Activity context, List<AirplaneReport> ar) : base() {
			this._context = context;
			this._ar = ar;
		}
        public override long GetItemId(int position)
        {
            return position;
        }
		public override AirplaneReport this[int position] {
			get { return _ar[position]; }
        }
        public override Java.Lang.Object GetItem(int position)
        {
			return _ar[position].city;
        }
        public override int Count {
			get { return _ar.Count; }
        }
        public override View GetView(int position, View convertView, ViewGroup parent)
        {
            View view = convertView; // re-use an existing view, if one is available
            if (view == null) // otherwise create a new one
				view = _context.LayoutInflater.Inflate(Android.Resource.Layout.ActivityListItem, null);
			view.FindViewById<TextView> (Android.Resource.Id.Text1).Text = String.Format("State: {0} City: {1}", _ar[position].state,_ar[position].city); 
//			view.FindViewById<TextView> (Android.Resource.Id.Text1).Text = String.Format("N#: {0} Model: {1}", _ar[position].airplanenumber,_ar[position].model); 
//				+ System.Environment.NewLine + String.Format("High: {0} Low: {1}", _wd[position].temp.max, _wd[position].temp.min);
			//var ic = view.FindViewById<ImageView>(Android.Resource.Id.Icon);
			//ic.SetImageBitmap(_wd[position].weather[0].Image);
            return view;
        }
    }
}
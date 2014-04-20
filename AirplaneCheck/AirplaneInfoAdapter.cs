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
	public class AirplaneInfoAdapter : BaseAdapter<AirplaneInfo>
    {
		Activity _context;

		public AirplaneInfoAdapter(Activity context) : base() {
			this._context = context;
		}
        public override long GetItemId(int position)
        {
			return AirplaneInfoData.Service.AirplaneInfos[position].id.Value;
        }
		public override AirplaneInfo this[int position] {
			get { return AirplaneInfoData.Service.AirplaneInfos[position]; }
        }
        public override int Count {
			get { return AirplaneInfoData.Service.AirplaneInfos.Count; }
        }
        public override View GetView(int position, View convertView, ViewGroup parent)
        {
            View view = convertView;
			if (view == null) view = _context.LayoutInflater.Inflate(Resource.Layout.AirplaneInfoItem, null);

			AirplaneInfo ai = AirplaneInfoData.Service.AirplaneInfos [position];

			var ic = view.FindViewById<ImageView>(Resource.Id.AirplaneImageView);
			switch (ai.statusCode.Trim()) {
				case "V":
					ic.SetImageResource(Resource.Drawable.greenicon);
					break;
				case "R":
					ic.SetImageResource(Resource.Drawable.orangeicon);
					break;
				default:
					break;
			}
			view.FindViewById<TextView> (Resource.Id.NnumberTextView).Text = ai.airplanenumber;
			view.FindViewById<TextView> (Resource.Id.ModelView).Text = ai.model;
			view.FindViewById<TextView> (Resource.Id.AirWorthDateTextView).Text = ai.airWorthDate.ToShortDateString();

			return view;
        }
    }
}